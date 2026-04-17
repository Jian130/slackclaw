import type { Locale } from "../../shared/i18n/messages.js";

export interface OnboardingCopy {
  brand: string;
  subtitle: string;
  skip: string;
  progressStep: string;
  progressComplete: string;
  stepLabels: string[];
  welcomeEyebrow: string;
  welcomeTitle: string;
  welcomeBody: string;
  welcomeHighlights: Array<{ title: string; body: string }>;
  welcomeSupport: string;
  welcomeTiming: string;
  begin: string;
  installEyebrow: string;
  installTitle: string;
  installBody: string;
  installDetected: string;
  installMissing: string;
  installCta: string;
  installUseExisting: string;
  installContinue: string;
  installSuccess: string;
  installFoundTitle: string;
  installFoundBody: string;
  installNotFoundTitle: string;
  installNotFoundBody: string;
  installInstallingTitle: string;
  installInstallingBody: string;
  installCompleteTitle: string;
  installCompleteBody: string;
  installVersionLabel: string;
  installStageDetecting: string;
  installStageReusing: string;
  installStageInstalling: string;
  installStageVerifying: string;
  installStageRestarting: string;
  modelEyebrow: string;
  modelTitle: string;
  modelBody: string;
  localAiTitle: string;
  localAiInstallCta: string;
  localAiRepairCta: string;
  localAiStorageLabel: string;
  localModelSetupTitle: string;
  localModelSetupBody: string;
  localModelDetectingTitle: string;
  localModelDetectingBody: string;
  localModelUnsupportedTitle: string;
  localModelUnsupportedBody: string;
  localModelUnsupportedCloudBody: string;
  localModelCloudFallbackCountdown: string;
  localModelDetectStepLabel: string;
  localModelPrepareStepLabel: string;
  localModelDownloadStepLabel: string;
  localModelConnectStepLabel: string;
  localModelDownloadAmountLabel: string;
  localModelDownloadRemainingLabel: string;
  localModelDownloadPercentLabel: string;
  localModelDownloadResumeNote: string;
  providerTitle: string;
  authTitle: string;
  authApiKeyLabel: string;
  authApiKeyBody: string;
  authOAuthLabel: string;
  authOAuthBody: string;
  minimaxTutorialTitle: string;
  minimaxTutorialBody: string;
  minimaxTutorialModalTitle: string;
  minimaxTutorialModalBody: string;
  minimaxTutorialFallbackTitle: string;
  minimaxTutorialFallbackBody: string;
  minimaxTutorialClose: string;
  minimaxGetKeyTitle: string;
  minimaxGetKeyBody: string;
  minimaxGetKeyCTA: string;
  minimaxEnterKeyTitle: string;
  minimaxEnterKeyBody: string;
  authProgressTitle: string;
  openAuthWindow: string;
  submitAuthInput: string;
  modelApiKeyTitle: string;
  modelApiKeyPlaceholder: string;
  modelApiKeyHelp: string;
  modelGetApiKey: string;
  modelSave: string;
  modelSaved: string;
  modelConnectedTitle: string;
  modelConnectedBody: string;
  channelEyebrow: string;
  channelTitle: string;
  channelBody: string;
  channelPickerHint: string;
  channelSave: string;
  channelSaveContinue: string;
  channelSaved: string;
  channelApplyHint: string;
  channelTutorialTitle: string;
  channelTutorialBody: string;
  channelTutorialModalTitle: string;
  channelTutorialModalBody: string;
  channelTutorialFallbackTitle: string;
  channelTutorialFallbackBody: string;
  channelTutorialClose: string;
  channelDocumentationCta: string;
  channelPlatformCta: string;
  channelWechatInstructionsTitle: string;
  channelWechatInstructionSteps: string[];
  channelWechatCorpId: string;
  channelWechatAgentId: string;
  channelWechatSecret: string;
  channelTelegramInstructionsTitle: string;
  channelTelegramInstructionSteps: string[];
  channelTelegramToken: string;
  channelFeishuTutorialTitle: string;
  channelFeishuTutorialBody: string;
  channelFeishuPlatformTitle: string;
  channelFeishuPlatformBody: string;
  channelFeishuCredentialsTitle: string;
  channelFeishuCredentialsBody: string;
  channelFeishuAppId: string;
  channelFeishuAppSecret: string;
  channelSecretHelp: string;
  employeeEyebrow: string;
  employeeTitle: string;
  employeeBody: string;
  employeeName: string;
  employeeRole: string;
  employeePreview: string;
  createEmployee: string;
  employeeSaved: string;
  memoryOn: string;
  memoryOff: string;
  completeEyebrow: string;
  completeTitle: string;
  completeBody: string;
  completionInstall: string;
  completionModel: string;
  completionChannel: string;
  completionEmployee: string;
  goTeam: string;
  goDashboard: string;
  goChat: string;
  saving: string;
  loading: string;
  required: string;
  chooseProvider: string;
  chooseChannel: string;
  chooseAvatar: string;
  personalityTitle: string;
  skillsTitle: string;
  pendingApplyTitle: string;
  operationStillRunning: string;
}

const en: OnboardingCopy = {
  brand: "ChillClaw",
  subtitle: "Build your OpenClaw-powered digital employee workspace in minutes",
  skip: "Skip onboarding",
  progressStep: "Step {current} of {total}",
  progressComplete: "Complete",
  stepLabels: ["Welcome", "Install", "Model", "Channel", "AI Employee", "Complete"],
  welcomeEyebrow: "Get started",
  welcomeTitle: "Welcome to ChillClaw",
  welcomeBody: "Build your OpenClaw-powered digital employee workspace in minutes",
  welcomeHighlights: [
    { title: "One-Click Setup", body: "Start ChillClaw in minutes with no terminal commands or technical configuration." },
    { title: "Personal AI Workspace", body: "Choose the right model, organize skills, and prepare a workspace for your digital employees." },
    { title: "Build Your First Digital Employee", body: "Create an AI teammate with a name, role, and skills to support your daily work." }
  ],
  welcomeSupport: "One workspace. Multiple digital employees. Built for modern super individuals.",
  welcomeTiming: "Takes about 3–5 minutes. Then you'll start creating your first digital employee.",
  begin: "Get My Workspace Ready",
  installEyebrow: "Step 2",
  installTitle: "Install OpenClaw",
  installBody: "We'll check if OpenClaw is installed and set it up for you",
  installDetected: "ChillClaw already found a compatible OpenClaw runtime on this Mac.",
  installMissing: "ChillClaw did not find an OpenClaw runtime yet. It will install the latest available version for this user.",
  installCta: "Install OpenClaw",
  installUseExisting: "Use existing OpenClaw",
  installContinue: "Next",
  installSuccess: "OpenClaw is ready. Continue to model setup.",
  installFoundTitle: "Compatible OpenClaw detected",
  installFoundBody: "This Mac already has OpenClaw ready. ChillClaw can keep using it.",
  installNotFoundTitle: "OpenClaw Not Found",
  installNotFoundBody: "Don't worry! We'll install it for you in just a few clicks.",
  installInstallingTitle: "Installing OpenClaw...",
  installInstallingBody: "This will take 2–3 minutes. Please don't close this window.",
  installCompleteTitle: "Installation Complete!",
  installCompleteBody: "OpenClaw is installed and ready for setup",
  installVersionLabel: "Version",
  installStageDetecting: "Checking this Mac...",
  installStageReusing: "Reusing existing runtime...",
  installStageInstalling: "Installing OpenClaw...",
  installStageVerifying: "Configuring services...",
  installStageRestarting: "Starting local services...",
  modelEyebrow: "Step 3",
  modelTitle: "Choose Your AI Model",
  modelBody: "Select an AI provider to power your digital employees",
  localAiTitle: "Use Local AI on This Mac",
  localAiInstallCta: "Install Local AI",
  localAiRepairCta: "Repair Local AI",
  localAiStorageLabel: "Needs about {gb} GB free",
  localModelSetupTitle: "Detect Hardware & Setup Local Model",
  localModelSetupBody: "We'll check your hardware and install a local AI model",
  localModelDetectingTitle: "Detecting Hardware...",
  localModelDetectingBody: "Analyzing your system's capabilities for local AI models",
  localModelUnsupportedTitle: "Local Model Not Recommended",
  localModelUnsupportedBody: "Your hardware doesn't meet the minimum requirements for running local AI models smoothly.",
  localModelUnsupportedCloudBody: "Don't worry! You can use powerful cloud AI instead.",
  localModelCloudFallbackCountdown: "Switching to cloud AI configuration in 2 seconds...",
  localModelDetectStepLabel: "Detect hardware",
  localModelPrepareStepLabel: "Prepare Ollama",
  localModelDownloadStepLabel: "Download local model",
  localModelConnectStepLabel: "Connect ChillClaw to local AI",
  localModelDownloadAmountLabel: "{downloaded} of {total} downloaded",
  localModelDownloadRemainingLabel: "{remaining} remaining",
  localModelDownloadPercentLabel: "{percent}% complete",
  localModelDownloadResumeNote: "You can leave this screen. ChillClaw will resume automatically if the download is interrupted.",
  providerTitle: "Select a provider to get started",
  authTitle: "How would you like to connect?",
  authApiKeyLabel: "API Key",
  authApiKeyBody: "Use your API key for quick setup",
  authOAuthLabel: "OAuth",
  authOAuthBody: "Connect securely with your account",
  minimaxTutorialTitle: "Watch Tutorial Video",
  minimaxTutorialBody: "Learn how to get your API Key in 2 minutes",
  minimaxTutorialModalTitle: "How to Get Your API Key",
  minimaxTutorialModalBody: "Watch this quick tutorial",
  minimaxTutorialFallbackTitle: "Video Tutorial Coming Soon",
  minimaxTutorialFallbackBody: "For now, click \"Get API Key\" button to visit the provider's website",
  minimaxTutorialClose: "Got it, let's continue",
  minimaxGetKeyTitle: "Get Your API Key",
  minimaxGetKeyBody: "Click the button below to visit MiniMax",
  minimaxGetKeyCTA: "Go to MiniMax",
  minimaxEnterKeyTitle: "Enter Your API Key Here",
  minimaxEnterKeyBody: "Paste the API Key you just copied",
  authProgressTitle: "Authentication progress",
  openAuthWindow: "Open authentication window",
  submitAuthInput: "Finish authentication",
  modelApiKeyTitle: "Enter your API Key",
  modelApiKeyPlaceholder: "Paste your API key here",
  modelApiKeyHelp: "Your key is encrypted and stored securely",
  modelGetApiKey: "Get API Key",
  modelSave: "Next",
  modelSaved: "Your first AI model is saved as the default onboarding model.",
  modelConnectedTitle: "Connected successfully!",
  modelConnectedBody: "Connected to {provider}",
  channelEyebrow: "Step 4",
  channelTitle: "Choose Communication Channel",
  channelBody: "Select how you want to talk to your digital employees",
  channelPickerHint: "Select a channel to get started",
  channelSave: "Save channel",
  channelSaveContinue: "Save & Continue",
  channelSaved: "Channel configuration saved.",
  channelApplyHint: "This channel is saved correctly and will become live after the gateway applies pending changes.",
  channelTutorialTitle: "Watch Tutorial Video",
  channelTutorialBody: "Learn how to set up this channel in a few minutes",
  channelTutorialModalTitle: "How to Set Up This Channel",
  channelTutorialModalBody: "Watch this quick tutorial",
  channelTutorialFallbackTitle: "Video Tutorial Coming Soon",
  channelTutorialFallbackBody: "For now, use the setup button below to open the provider platform or documentation.",
  channelTutorialClose: "Got it, let's continue",
  channelDocumentationCta: "Open Documentation",
  channelPlatformCta: "Open Setup",
  channelWechatInstructionsTitle: "Setup Instructions for WeChat Work",
  channelWechatInstructionSteps: [
    "Visit the WeChat Work admin console: https://work.weixin.qq.com/ and sign in with an admin account.",
    "Create an app: open Application Management → Applications → Create Application.",
    "Configure the app: set the application name and upload the icon.",
    "Copy your credentials: save the Corp ID, Agent ID, and Secret from the application settings."
  ],
  channelWechatCorpId: "Corp ID",
  channelWechatAgentId: "Bot ID",
  channelWechatSecret: "Secret",
  channelTelegramInstructionsTitle: "Setup Instructions for Telegram",
  channelTelegramInstructionSteps: [
    "Open Telegram and start a chat with @BotFather.",
    "Create a new bot by sending /newbot and follow the prompts.",
    "Copy the bot token from BotFather. It looks like 123456:ABC-DEF..."
  ],
  channelTelegramToken: "Bot Token",
  channelFeishuTutorialTitle: "Watch Tutorial Video",
  channelFeishuTutorialBody: "Learn how to set up Feishu in 3 minutes",
  channelFeishuPlatformTitle: "Start Setup",
  channelFeishuPlatformBody: "Go to Feishu and create your app credentials",
  channelFeishuCredentialsTitle: "Enter Your Credentials",
  channelFeishuCredentialsBody: "Paste the App ID and App Secret you just copied",
  channelFeishuAppId: "App ID",
  channelFeishuAppSecret: "App Secret",
  channelSecretHelp: "Your credentials are encrypted and stored locally",
  employeeEyebrow: "Step 6",
  employeeTitle: "Create your first AI employee",
  employeeBody: "Choose an avatar, role, and preset skills. ChillClaw creates a real OpenClaw agent workspace behind this employee.",
  employeeName: "Employee name",
  employeeRole: "Job title",
  employeePreview: "Employee preview",
  createEmployee: "Create AI employee",
  employeeSaved: "Your first AI employee is ready.",
  memoryOn: "Memory enabled",
  memoryOff: "Memory disabled",
  completeEyebrow: "Step 7",
  completeTitle: "Your workspace is ready",
  completeBody: "ChillClaw finished the guided setup. Choose where you want to go next.",
  completionInstall: "OpenClaw",
  completionModel: "Model",
  completionChannel: "Channel",
  completionEmployee: "AI employee",
  goTeam: "Open AI Team",
  goDashboard: "Open Dashboard",
  goChat: "Open Chat",
  saving: "Saving",
  loading: "Loading onboarding",
  required: "Required",
  chooseProvider: "Choose a provider first",
  chooseChannel: "Choose a channel first",
  chooseAvatar: "Choose avatar",
  personalityTitle: "Personality",
  skillsTitle: "Preset skill sets",
  pendingApplyTitle: "Gateway apply pending",
  operationStillRunning: "ChillClaw is still working. Progress was refreshed from the daemon, and you can continue when the current step settles."
};

const zh: OnboardingCopy = {
  brand: "ChillClaw",
  subtitle: "几分钟内搭建你的 OpenClaw 数字员工工作区",
  skip: "跳过引导",
  progressStep: "第 {current} / {total} 步",
  progressComplete: "已完成",
  stepLabels: ["欢迎", "安装", "模型", "渠道", "AI 员工", "完成"],
  welcomeEyebrow: "开始使用",
  welcomeTitle: "欢迎来到 ChillClaw",
  welcomeBody: "几分钟内搭建你的 OpenClaw 数字员工工作区",
  welcomeHighlights: [
    { title: "一键完成设置", body: "无需终端命令或复杂技术配置，几分钟内启动 ChillClaw。" },
    { title: "个人 AI 工作区", body: "选择合适模型、整理技能，并为你的数字员工准备工作区。" },
    { title: "创建第一位数字员工", body: "创建一个具备名字、角色和技能的 AI 搭档，支持你的日常工作。" }
  ],
  welcomeSupport: "一个工作区，多位数字员工，为现代超级个体打造。",
  welcomeTiming: "大约需要 3–5 分钟。随后你将开始创建第一位数字员工。",
  begin: "开始准备我的工作区",
  installEyebrow: "第 2 步",
  installTitle: "安装 OpenClaw",
  installBody: "我们会检查 OpenClaw 是否已安装，并为你完成设置",
  installDetected: "ChillClaw 已在这台 Mac 上发现兼容的 OpenClaw 运行时。",
  installMissing: "ChillClaw 还未发现 OpenClaw 运行时，将为当前用户安装最新可用版本。",
  installCta: "安装 OpenClaw",
  installUseExisting: "使用现有 OpenClaw",
  installContinue: "下一步",
  installSuccess: "OpenClaw 已就绪，继续配置模型。",
  installFoundTitle: "已检测到兼容的 OpenClaw",
  installFoundBody: "这台 Mac 已经准备好 OpenClaw，ChillClaw 可以直接继续使用它。",
  installNotFoundTitle: "未找到 OpenClaw",
  installNotFoundBody: "别担心！我们只需几次点击就能帮你安装完成。",
  installInstallingTitle: "正在安装 OpenClaw...",
  installInstallingBody: "这大约需要 2–3 分钟。请不要关闭此窗口。",
  installCompleteTitle: "安装完成！",
  installCompleteBody: "OpenClaw 已安装完毕，可以开始设置",
  installVersionLabel: "版本",
  installStageDetecting: "正在检查这台 Mac...",
  installStageReusing: "正在复用现有运行时...",
  installStageInstalling: "正在安装 OpenClaw...",
  installStageVerifying: "正在配置服务...",
  installStageRestarting: "正在启动本地服务...",
  modelEyebrow: "第 3 步",
  modelTitle: "选择你的 AI 模型",
  modelBody: "选择一个 AI 供应商，为你的数字员工提供能力支持",
  localAiTitle: "在这台 Mac 上使用本地 AI",
  localAiInstallCta: "安装本地 AI",
  localAiRepairCta: "修复本地 AI",
  localAiStorageLabel: "大约需要 {gb} GB 可用空间",
  localModelSetupTitle: "检测硬件并设置本地模型",
  localModelSetupBody: "我们会检查你的硬件，并安装一个本地 AI 模型",
  localModelDetectingTitle: "正在检测硬件...",
  localModelDetectingBody: "正在分析你的系统是否适合运行本地 AI 模型",
  localModelUnsupportedTitle: "不建议使用本地模型",
  localModelUnsupportedBody: "你的硬件暂时达不到流畅运行本地 AI 模型的最低建议配置。",
  localModelUnsupportedCloudBody: "别担心，你仍然可以使用强大的云端 AI。",
  localModelCloudFallbackCountdown: "将在 2 秒后切换到云端 AI 配置...",
  localModelDetectStepLabel: "检测硬件",
  localModelPrepareStepLabel: "准备 Ollama",
  localModelDownloadStepLabel: "下载本地模型",
  localModelConnectStepLabel: "连接 ChillClaw 到本地 AI",
  localModelDownloadAmountLabel: "已下载 {downloaded} / {total}",
  localModelDownloadRemainingLabel: "剩余 {remaining}",
  localModelDownloadPercentLabel: "已完成 {percent}%",
  localModelDownloadResumeNote: "你可以离开此页面。如果下载中断，ChillClaw 会自动继续。",
  providerTitle: "选择一个供应商开始",
  authTitle: "你希望如何连接？",
  authApiKeyLabel: "API Key",
  authApiKeyBody: "使用 API Key 快速完成设置",
  authOAuthLabel: "OAuth",
  authOAuthBody: "使用你的账户安全连接",
  minimaxTutorialTitle: "观看教学视频",
  minimaxTutorialBody: "2 分钟内学会如何获取 API Key",
  minimaxTutorialModalTitle: "如何获取你的 API Key",
  minimaxTutorialModalBody: "观看这个快速教程",
  minimaxTutorialFallbackTitle: "视频教程即将上线",
  minimaxTutorialFallbackBody: "现在请先点击“获取 API Key”按钮访问供应商平台",
  minimaxTutorialClose: "知道了，继续",
  minimaxGetKeyTitle: "获取你的 API Key",
  minimaxGetKeyBody: "点击下面的按钮访问 MiniMax",
  minimaxGetKeyCTA: "前往 MiniMax",
  minimaxEnterKeyTitle: "在这里输入你的 API Key",
  minimaxEnterKeyBody: "粘贴你刚刚复制的 API Key",
  authProgressTitle: "认证进度",
  openAuthWindow: "打开认证窗口",
  submitAuthInput: "完成认证",
  modelApiKeyTitle: "输入你的 API Key",
  modelApiKeyPlaceholder: "在此粘贴你的 API Key",
  modelApiKeyHelp: "你的密钥会被加密并安全存储",
  modelGetApiKey: "获取 API Key",
  modelSave: "下一步",
  modelSaved: "首个 AI 模型已保存为默认引导模型。",
  modelConnectedTitle: "连接成功！",
  modelConnectedBody: "已连接到 {provider}",
  channelEyebrow: "第 4 步",
  channelTitle: "选择沟通渠道",
  channelBody: "选择你希望如何与数字员工交流",
  channelPickerHint: "选择一个渠道开始",
  channelSave: "保存渠道",
  channelSaveContinue: "保存并继续",
  channelSaved: "渠道配置已保存。",
  channelApplyHint: "该渠道已正确保存，待网关应用挂起变更后即可生效。",
  channelTutorialTitle: "观看教学视频",
  channelTutorialBody: "几分钟内学会如何配置这个渠道",
  channelTutorialModalTitle: "如何配置这个渠道",
  channelTutorialModalBody: "观看这个快速教程",
  channelTutorialFallbackTitle: "视频教程即将上线",
  channelTutorialFallbackBody: "现在请先使用下面的按钮打开平台或文档继续完成配置。",
  channelTutorialClose: "知道了，继续",
  channelDocumentationCta: "打开文档",
  channelPlatformCta: "前往设置",
  channelWechatInstructionsTitle: "企业微信配置说明",
  channelWechatInstructionSteps: [
    "访问企业微信管理后台：前往 https://work.weixin.qq.com 并使用管理员账户登录",
    "创建新应用：导航至“应用管理”→“应用”→“创建应用”",
    "配置应用：填写应用名称并上传图标",
    "获取 API 凭证：从应用设置中复制您的企业 ID、应用 ID 和 Secret"
  ],
  channelWechatCorpId: "Corp ID",
  channelWechatAgentId: "Bot ID",
  channelWechatSecret: "Secret",
  channelTelegramInstructionsTitle: "Telegram 配置说明",
  channelTelegramInstructionSteps: [
    "打开 Telegram 并找到 BotFather：在 Telegram 中搜索 @BotFather 并开始聊天",
    "创建新机器人：发送 /newbot 并按照提示为你的机器人命名",
    "获取机器人令牌：BotFather 会给你一个 token，格式类似 123456:ABC-DEF..."
  ],
  channelTelegramToken: "Bot Token",
  channelFeishuTutorialTitle: "观看教学视频",
  channelFeishuTutorialBody: "3 分钟内学会如何配置飞书",
  channelFeishuPlatformTitle: "开始配置",
  channelFeishuPlatformBody: "前往飞书并创建你的应用凭证",
  channelFeishuCredentialsTitle: "输入你的凭证",
  channelFeishuCredentialsBody: "粘贴你刚刚复制的 App ID 和 App Secret",
  channelFeishuAppId: "App ID",
  channelFeishuAppSecret: "App Secret",
  channelSecretHelp: "你的凭证会被加密并存储在本地",
  employeeEyebrow: "第 6 步",
  employeeTitle: "创建第一个 AI 员工",
  employeeBody: "选择头像、角色和预设技能。ChillClaw 会在后台创建真实的 OpenClaw agent 工作区。",
  employeeName: "员工名称",
  employeeRole: "职位名称",
  employeePreview: "员工预览",
  createEmployee: "创建 AI 员工",
  employeeSaved: "首位 AI 员工已准备就绪。",
  memoryOn: "已启用记忆",
  memoryOff: "已关闭记忆",
  completeEyebrow: "第 7 步",
  completeTitle: "你的工作区已准备完成",
  completeBody: "ChillClaw 已完成引导设置。选择你接下来想去的页面。",
  completionInstall: "OpenClaw",
  completionModel: "模型",
  completionChannel: "渠道",
  completionEmployee: "AI 员工",
  goTeam: "进入 AI Team",
  goDashboard: "进入 Dashboard",
  goChat: "进入 Chat",
  saving: "正在保存",
  loading: "正在加载引导流程",
  required: "必填",
  chooseProvider: "请先选择供应商",
  chooseChannel: "请先选择渠道",
  chooseAvatar: "选择头像",
  personalityTitle: "人格特征",
  skillsTitle: "预设技能组合",
  pendingApplyTitle: "待应用网关变更",
  operationStillRunning: "ChillClaw 仍在处理。进度已从守护进程刷新，当前步骤完成后即可继续。"
};

const ja: OnboardingCopy = {
  brand: "ChillClaw",
  subtitle: "数分で OpenClaw ベースのデジタル従業員ワークスペースを構築します",
  skip: "オンボーディングをスキップ",
  progressStep: "ステップ {current} / {total}",
  progressComplete: "完了",
  stepLabels: ["開始", "インストール", "モデル", "チャネル", "AI 社員", "完了"],
  welcomeEyebrow: "スタート",
  welcomeTitle: "ChillClaw へようこそ",
  welcomeBody: "数分で OpenClaw ベースのデジタル従業員ワークスペースを構築します",
  welcomeHighlights: [
    { title: "ワンクリックでセットアップ", body: "ターミナル操作や高度な技術設定なしで、数分で ChillClaw を開始できます。" },
    { title: "個人用 AI ワークスペース", body: "最適なモデルを選び、スキルを整理し、デジタル従業員用のワークスペースを整えます。" },
    { title: "最初のデジタル従業員を作成", body: "名前、役割、スキルを持つ AI チームメイトを作り、日々の仕事を支援させます。" }
  ],
  welcomeSupport: "ひとつのワークスペース。複数のデジタル従業員。現代のスーパーインディビジュアルのために。",
  welcomeTiming: "所要時間は約 3〜5 分です。その後、最初のデジタル従業員の作成に進みます。",
  begin: "ワークスペースの準備を始める",
  installEyebrow: "ステップ 2",
  installTitle: "OpenClaw をインストール",
  installBody: "OpenClaw がインストール済みか確認し、必要なセットアップを行います",
  installDetected: "この Mac には既に互換性のある OpenClaw ランタイムがあります。",
  installMissing: "まだ OpenClaw ランタイムが見つかっていません。現在のユーザー向けに最新バージョンをインストールします。",
  installCta: "OpenClaw をインストール",
  installUseExisting: "既存の OpenClaw を使う",
  installContinue: "次へ",
  installSuccess: "OpenClaw の準備ができました。次にモデルを設定します。",
  installFoundTitle: "互換性のある OpenClaw を検出しました",
  installFoundBody: "この Mac には OpenClaw がすでに用意されています。ChillClaw はそのまま使い続けられます。",
  installNotFoundTitle: "OpenClaw が見つかりません",
  installNotFoundBody: "ご安心ください。数回のクリックでインストールできます。",
  installInstallingTitle: "OpenClaw をインストールしています...",
  installInstallingBody: "2〜3 分ほどかかります。このウィンドウは閉じないでください。",
  installCompleteTitle: "インストール完了！",
  installCompleteBody: "OpenClaw のインストールが完了し、セットアップを開始できます",
  installVersionLabel: "バージョン",
  installStageDetecting: "この Mac を確認しています...",
  installStageReusing: "既存のランタイムを再利用しています...",
  installStageInstalling: "OpenClaw をインストールしています...",
  installStageVerifying: "サービスを設定しています...",
  installStageRestarting: "ローカルサービスを起動しています...",
  modelEyebrow: "ステップ 3",
  modelTitle: "AI モデルを選択",
  modelBody: "デジタル従業員を支える AI プロバイダーを選択してください",
  localAiTitle: "この Mac でローカル AI を使う",
  localAiInstallCta: "ローカル AI をインストール",
  localAiRepairCta: "ローカル AI を修復",
  localAiStorageLabel: "約 {gb} GB の空き容量が必要です",
  localModelSetupTitle: "ハードウェアを検出してローカルモデルを設定",
  localModelSetupBody: "ハードウェアを確認し、ローカル AI モデルをインストールします",
  localModelDetectingTitle: "ハードウェアを検出しています...",
  localModelDetectingBody: "ローカル AI モデルを動かせるかシステムを確認しています",
  localModelUnsupportedTitle: "ローカルモデルは非推奨です",
  localModelUnsupportedBody: "このハードウェアはローカル AI モデルを快適に動かすための推奨条件を満たしていません。",
  localModelUnsupportedCloudBody: "ご安心ください。代わりにクラウド AI を利用できます。",
  localModelCloudFallbackCountdown: "2 秒後にクラウド AI の設定へ切り替えます...",
  localModelDetectStepLabel: "ハードウェアを検出",
  localModelPrepareStepLabel: "Ollama を準備",
  localModelDownloadStepLabel: "ローカルモデルをダウンロード",
  localModelConnectStepLabel: "ChillClaw をローカル AI に接続",
  localModelDownloadAmountLabel: "{downloaded} / {total} をダウンロード済み",
  localModelDownloadRemainingLabel: "残り {remaining}",
  localModelDownloadPercentLabel: "{percent}% 完了",
  localModelDownloadResumeNote: "この画面を離れても大丈夫です。ダウンロードが中断しても、ChillClaw が自動で再開します。",
  providerTitle: "プロバイダーを選んで開始",
  authTitle: "どの方法で接続しますか？",
  authApiKeyLabel: "API Key",
  authApiKeyBody: "API キーですばやく設定します",
  authOAuthLabel: "OAuth",
  authOAuthBody: "アカウントで安全に接続します",
  minimaxTutorialTitle: "チュートリアル動画を見る",
  minimaxTutorialBody: "2 分で API Key の取得方法を確認できます",
  minimaxTutorialModalTitle: "API Key の取得方法",
  minimaxTutorialModalBody: "このクイックチュートリアルをご覧ください",
  minimaxTutorialFallbackTitle: "動画チュートリアルは準備中です",
  minimaxTutorialFallbackBody: "今は「API キーを取得」ボタンからプロバイダーのサイトへ進んでください",
  minimaxTutorialClose: "了解して続行",
  minimaxGetKeyTitle: "API Key を取得する",
  minimaxGetKeyBody: "下のボタンから MiniMax にアクセスしてください",
  minimaxGetKeyCTA: "MiniMax に移動",
  minimaxEnterKeyTitle: "ここに API Key を入力",
  minimaxEnterKeyBody: "先ほどコピーした API Key を貼り付けてください",
  authProgressTitle: "認証の進行状況",
  openAuthWindow: "認証ウィンドウを開く",
  submitAuthInput: "認証を完了",
  modelApiKeyTitle: "API キーを入力",
  modelApiKeyPlaceholder: "ここに API キーを貼り付けてください",
  modelApiKeyHelp: "キーは暗号化され、安全に保存されます",
  modelGetApiKey: "API キーを取得",
  modelSave: "次へ",
  modelSaved: "最初の AI モデルを既定モデルとして保存しました。",
  modelConnectedTitle: "接続に成功しました！",
  modelConnectedBody: "{provider} に接続済み",
  channelEyebrow: "ステップ 4",
  channelTitle: "コミュニケーションチャネルを選択",
  channelBody: "デジタル従業員と会話する方法を選択します",
  channelPickerHint: "開始するチャネルを選択してください",
  channelSave: "チャネルを保存",
  channelSaveContinue: "保存して続行",
  channelSaved: "チャネル設定を保存しました。",
  channelApplyHint: "このチャネル設定は保存済みです。保留中の変更をゲートウェイに適用すると有効になります。",
  channelTutorialTitle: "チュートリアル動画を見る",
  channelTutorialBody: "このチャネルの設定方法を数分で学びます",
  channelTutorialModalTitle: "このチャネルの設定方法",
  channelTutorialModalBody: "このクイックチュートリアルをご覧ください",
  channelTutorialFallbackTitle: "動画チュートリアルは準備中です",
  channelTutorialFallbackBody: "今は下のボタンからプラットフォームまたはドキュメントを開いてください。",
  channelTutorialClose: "了解、続けます",
  channelDocumentationCta: "ドキュメントを開く",
  channelPlatformCta: "セットアップを開く",
  channelWechatInstructionsTitle: "WeChat Work のセットアップ手順",
  channelWechatInstructionSteps: [
    "WeChat Work 管理コンソール https://work.weixin.qq.com/ を開き、管理者アカウントでログインします。",
    "アプリ管理 → アプリ → 新しいアプリを作成 を選びます。",
    "アプリ名とアイコンを設定します。",
    "設定画面から Corp ID、Agent ID、Secret をコピーします。"
  ],
  channelWechatCorpId: "Corp ID",
  channelWechatAgentId: "Bot ID",
  channelWechatSecret: "Secret",
  channelTelegramInstructionsTitle: "Telegram のセットアップ手順",
  channelTelegramInstructionSteps: [
    "Telegram を開いて @BotFather を検索し、チャットを開始します。",
    "/newbot を送信して新しいボットを作成します。",
    "BotFather から発行されたトークンをコピーします。"
  ],
  channelTelegramToken: "Bot Token",
  channelFeishuTutorialTitle: "チュートリアル動画を見る",
  channelFeishuTutorialBody: "3 分で Feishu のセットアップを学びます",
  channelFeishuPlatformTitle: "セットアップ開始",
  channelFeishuPlatformBody: "Feishu に移動してアプリ資格情報を作成します",
  channelFeishuCredentialsTitle: "資格情報を入力",
  channelFeishuCredentialsBody: "コピーした App ID と App Secret を貼り付けます",
  channelFeishuAppId: "App ID",
  channelFeishuAppSecret: "App Secret",
  channelSecretHelp: "資格情報は暗号化されてローカルに保存されます",
  employeeEyebrow: "ステップ 6",
  employeeTitle: "最初の AI 社員を作成",
  employeeBody: "アバター、役割、プリセットスキルを選択します。ChillClaw が実際の OpenClaw エージェント環境を作成します。",
  employeeName: "社員名",
  employeeRole: "役職",
  employeePreview: "社員プレビュー",
  createEmployee: "AI 社員を作成",
  employeeSaved: "最初の AI 社員の準備ができました。",
  memoryOn: "メモリ有効",
  memoryOff: "メモリ無効",
  completeEyebrow: "ステップ 7",
  completeTitle: "ワークスペースの準備が整いました",
  completeBody: "ガイド付きセットアップが完了しました。次に開く画面を選んでください。",
  completionInstall: "OpenClaw",
  completionModel: "モデル",
  completionChannel: "チャネル",
  completionEmployee: "AI 社員",
  goTeam: "AI Team を開く",
  goDashboard: "Dashboard を開く",
  goChat: "Chat を開く",
  saving: "保存中",
  loading: "オンボーディングを読み込み中",
  required: "必須",
  chooseProvider: "先にプロバイダーを選択してください",
  chooseChannel: "先にチャネルを選択してください",
  chooseAvatar: "アバターを選択",
  personalityTitle: "性格",
  skillsTitle: "プリセットスキルセット",
  pendingApplyTitle: "ゲートウェイ適用待ち",
  operationStillRunning: "ChillClaw はまだ処理中です。デーモンから進行状況を更新しました。現在のステップが落ち着いたら続行できます。"
};

const ko: OnboardingCopy = {
  brand: "ChillClaw",
  subtitle: "몇 분 안에 OpenClaw 기반 디지털 직원 작업 공간을 만드세요",
  skip: "온보딩 건너뛰기",
  progressStep: "{current}/{total}단계",
  progressComplete: "완료",
  stepLabels: ["시작", "설치", "모델", "채널", "AI 직원", "완료"],
  welcomeEyebrow: "시작하기",
  welcomeTitle: "ChillClaw에 오신 것을 환영합니다",
  welcomeBody: "몇 분 안에 OpenClaw 기반 디지털 직원 작업 공간을 만드세요",
  welcomeHighlights: [
    { title: "원클릭 설정", body: "터미널 명령이나 복잡한 기술 설정 없이 몇 분 안에 ChillClaw를 시작합니다." },
    { title: "개인 AI 작업 공간", body: "적절한 모델을 선택하고, 스킬을 정리하고, 디지털 직원용 작업 공간을 준비하세요." },
    { title: "첫 디지털 직원 만들기", body: "이름, 역할, 스킬을 갖춘 AI 팀원을 만들어 일상 업무를 지원하게 하세요." }
  ],
  welcomeSupport: "하나의 작업 공간. 여러 디지털 직원. 현대의 슈퍼 개인을 위해 설계되었습니다.",
  welcomeTiming: "약 3~5분 정도 걸립니다. 그다음 첫 디지털 직원을 만들게 됩니다.",
  begin: "내 작업 공간 준비하기",
  installEyebrow: "2단계",
  installTitle: "OpenClaw 설치",
  installBody: "OpenClaw가 설치되어 있는지 확인하고 필요한 설정을 진행합니다",
  installDetected: "이 Mac에서 이미 호환되는 OpenClaw 런타임을 찾았습니다.",
  installMissing: "아직 OpenClaw 런타임이 없습니다. 현재 사용자를 위해 최신 버전을 설치합니다.",
  installCta: "OpenClaw 설치",
  installUseExisting: "기존 OpenClaw 사용",
  installContinue: "다음",
  installSuccess: "OpenClaw 준비가 끝났습니다. 이제 모델을 설정하세요.",
  installFoundTitle: "호환되는 OpenClaw를 찾았습니다",
  installFoundBody: "이 Mac에는 이미 OpenClaw가 준비되어 있습니다. ChillClaw가 그대로 사용할 수 있습니다.",
  installNotFoundTitle: "OpenClaw를 찾을 수 없습니다",
  installNotFoundBody: "걱정하지 마세요. 몇 번의 클릭만으로 설치해 드립니다.",
  installInstallingTitle: "OpenClaw 설치 중...",
  installInstallingBody: "2~3분 정도 걸립니다. 이 창을 닫지 마세요.",
  installCompleteTitle: "설치 완료!",
  installCompleteBody: "OpenClaw 설치가 완료되어 설정을 시작할 수 있습니다",
  installVersionLabel: "버전",
  installStageDetecting: "이 Mac을 확인하는 중...",
  installStageReusing: "기존 런타임을 재사용하는 중...",
  installStageInstalling: "OpenClaw를 설치하는 중...",
  installStageVerifying: "서비스를 구성하는 중...",
  installStageRestarting: "로컬 서비스를 시작하는 중...",
  modelEyebrow: "3단계",
  modelTitle: "AI 모델 선택",
  modelBody: "디지털 직원에게 사용할 AI 제공자를 선택하세요",
  localAiTitle: "이 Mac에서 로컬 AI 사용",
  localAiInstallCta: "로컬 AI 설치",
  localAiRepairCta: "로컬 AI 복구",
  localAiStorageLabel: "약 {gb}GB 여유 공간 필요",
  localModelSetupTitle: "하드웨어를 감지하고 로컬 모델 설정",
  localModelSetupBody: "하드웨어를 확인하고 로컬 AI 모델을 설치합니다",
  localModelDetectingTitle: "하드웨어를 감지하는 중...",
  localModelDetectingBody: "로컬 AI 모델을 실행할 수 있는지 시스템 성능을 분석하고 있습니다",
  localModelUnsupportedTitle: "로컬 모델은 권장되지 않습니다",
  localModelUnsupportedBody: "이 하드웨어는 로컬 AI 모델을 원활하게 실행하기 위한 최소 권장 사양을 충족하지 않습니다.",
  localModelUnsupportedCloudBody: "걱정하지 마세요. 대신 강력한 클라우드 AI를 사용할 수 있습니다.",
  localModelCloudFallbackCountdown: "2초 후 클라우드 AI 설정으로 전환합니다...",
  localModelDetectStepLabel: "하드웨어 감지",
  localModelPrepareStepLabel: "Ollama 준비",
  localModelDownloadStepLabel: "로컬 모델 다운로드",
  localModelConnectStepLabel: "ChillClaw를 로컬 AI에 연결",
  localModelDownloadAmountLabel: "{downloaded} / {total} 다운로드됨",
  localModelDownloadRemainingLabel: "{remaining} 남음",
  localModelDownloadPercentLabel: "{percent}% 완료",
  localModelDownloadResumeNote: "이 화면을 떠나도 됩니다. 다운로드가 중단되면 ChillClaw가 자동으로 이어받습니다.",
  providerTitle: "시작할 제공자를 선택하세요",
  authTitle: "어떤 방식으로 연결하시겠어요?",
  authApiKeyLabel: "API Key",
  authApiKeyBody: "API Key로 빠르게 설정하세요",
  authOAuthLabel: "OAuth",
  authOAuthBody: "계정으로 안전하게 연결하세요",
  minimaxTutorialTitle: "튜토리얼 영상 보기",
  minimaxTutorialBody: "2분 안에 API Key를 얻는 방법을 알아보세요",
  minimaxTutorialModalTitle: "API Key 받는 방법",
  minimaxTutorialModalBody: "이 짧은 튜토리얼을 확인하세요",
  minimaxTutorialFallbackTitle: "동영상 튜토리얼 준비 중",
  minimaxTutorialFallbackBody: "지금은 \"API Key 받기\" 버튼을 눌러 공급자 사이트로 이동해 주세요",
  minimaxTutorialClose: "확인했고 계속할게요",
  minimaxGetKeyTitle: "API Key 받기",
  minimaxGetKeyBody: "아래 버튼을 눌러 MiniMax로 이동하세요",
  minimaxGetKeyCTA: "MiniMax로 이동",
  minimaxEnterKeyTitle: "여기에 API Key를 입력하세요",
  minimaxEnterKeyBody: "방금 복사한 API Key를 붙여넣으세요",
  authProgressTitle: "인증 진행 상황",
  openAuthWindow: "인증 창 열기",
  submitAuthInput: "인증 완료",
  modelApiKeyTitle: "API Key 입력",
  modelApiKeyPlaceholder: "여기에 API Key를 붙여 넣으세요",
  modelApiKeyHelp: "키는 암호화되어 안전하게 저장됩니다",
  modelGetApiKey: "API Key 받기",
  modelSave: "다음",
  modelSaved: "첫 AI 모델이 기본 온보딩 모델로 저장되었습니다.",
  modelConnectedTitle: "연결되었습니다!",
  modelConnectedBody: "{provider}에 연결됨",
  channelEyebrow: "4단계",
  channelTitle: "커뮤니케이션 채널 선택",
  channelBody: "디지털 직원과 대화할 방법을 선택하세요",
  channelPickerHint: "시작할 채널을 선택하세요",
  channelSave: "채널 저장",
  channelSaveContinue: "저장 후 계속",
  channelSaved: "채널 구성이 저장되었습니다.",
  channelApplyHint: "이 채널은 올바르게 저장되었습니다. 게이트웨이가 대기 중인 변경을 적용하면 활성화됩니다.",
  channelTutorialTitle: "튜토리얼 영상 보기",
  channelTutorialBody: "이 채널 설정 방법을 몇 분 안에 배웁니다",
  channelTutorialModalTitle: "이 채널 설정 방법",
  channelTutorialModalBody: "빠른 튜토리얼을 확인하세요",
  channelTutorialFallbackTitle: "영상 튜토리얼 준비 중",
  channelTutorialFallbackBody: "지금은 아래 버튼으로 플랫폼 또는 문서를 열어 설정을 계속하세요.",
  channelTutorialClose: "확인, 계속",
  channelDocumentationCta: "문서 열기",
  channelPlatformCta: "설정 열기",
  channelWechatInstructionsTitle: "WeChat Work 설정 안내",
  channelWechatInstructionSteps: [
    "WeChat Work 관리 콘솔 https://work.weixin.qq.com/ 에서 관리자 계정으로 로그인하세요.",
    "애플리케이션 관리 → 애플리케이션 → 새 애플리케이션 생성으로 이동하세요.",
    "앱 이름과 아이콘을 설정하세요.",
    "설정에서 Corp ID, Agent ID, Secret을 복사하세요."
  ],
  channelWechatCorpId: "Corp ID",
  channelWechatAgentId: "Bot ID",
  channelWechatSecret: "Secret",
  channelTelegramInstructionsTitle: "Telegram 설정 안내",
  channelTelegramInstructionSteps: [
    "Telegram에서 @BotFather를 찾아 채팅을 시작하세요.",
    "/newbot 을 보내 새 봇을 만드세요.",
    "BotFather가 제공한 토큰을 복사하세요."
  ],
  channelTelegramToken: "Bot Token",
  channelFeishuTutorialTitle: "튜토리얼 영상 보기",
  channelFeishuTutorialBody: "3분 안에 Feishu 설정 방법을 배웁니다",
  channelFeishuPlatformTitle: "설정 시작",
  channelFeishuPlatformBody: "Feishu로 이동해 앱 자격 증명을 만드세요",
  channelFeishuCredentialsTitle: "자격 증명 입력",
  channelFeishuCredentialsBody: "복사한 App ID 와 App Secret 을 붙여넣으세요",
  channelFeishuAppId: "App ID",
  channelFeishuAppSecret: "App Secret",
  channelSecretHelp: "자격 증명은 암호화되어 로컬에 저장됩니다",
  employeeEyebrow: "6단계",
  employeeTitle: "첫 AI 직원 만들기",
  employeeBody: "아바타, 역할, 프리셋 스킬을 선택하세요. ChillClaw가 실제 OpenClaw 에이전트 작업 공간을 만듭니다.",
  employeeName: "직원 이름",
  employeeRole: "직무",
  employeePreview: "직원 미리보기",
  createEmployee: "AI 직원 만들기",
  employeeSaved: "첫 AI 직원이 준비되었습니다.",
  memoryOn: "메모리 사용",
  memoryOff: "메모리 끔",
  completeEyebrow: "7단계",
  completeTitle: "작업 공간 준비 완료",
  completeBody: "안내 설정이 끝났습니다. 다음에 열 페이지를 선택하세요.",
  completionInstall: "OpenClaw",
  completionModel: "모델",
  completionChannel: "채널",
  completionEmployee: "AI 직원",
  goTeam: "AI Team 열기",
  goDashboard: "Dashboard 열기",
  goChat: "Chat 열기",
  saving: "저장 중",
  loading: "온보딩 불러오는 중",
  required: "필수",
  chooseProvider: "먼저 제공자를 선택하세요",
  chooseChannel: "먼저 채널을 선택하세요",
  chooseAvatar: "아바타 선택",
  personalityTitle: "성격",
  skillsTitle: "프리셋 스킬 세트",
  pendingApplyTitle: "게이트웨이 적용 대기",
  operationStillRunning: "ChillClaw가 아직 작업 중입니다. 데몬에서 진행 상황을 새로 고쳤으며 현재 단계가 안정되면 계속할 수 있습니다."
};

const es: OnboardingCopy = {
  brand: "ChillClaw",
  subtitle: "Construye en minutos tu espacio de trabajo de empleados digitales impulsado por OpenClaw",
  skip: "Omitir onboarding",
  progressStep: "Paso {current} de {total}",
  progressComplete: "Completado",
  stepLabels: ["Inicio", "Instalar", "Modelo", "Canal", "Empleado IA", "Completo"],
  welcomeEyebrow: "Comenzar",
  welcomeTitle: "Bienvenido a ChillClaw",
  welcomeBody: "Construye en minutos tu espacio de trabajo de empleados digitales impulsado por OpenClaw",
  welcomeHighlights: [
    { title: "Configuración con un clic", body: "Inicia ChillClaw en minutos sin comandos de terminal ni configuración técnica compleja." },
    { title: "Espacio de trabajo personal con IA", body: "Elige el modelo adecuado, organiza habilidades y prepara un espacio para tus empleados digitales." },
    { title: "Crea tu primer empleado digital", body: "Crea un compañero de IA con nombre, rol y habilidades para apoyar tu trabajo diario." }
  ],
  welcomeSupport: "Un solo espacio de trabajo. Múltiples empleados digitales. Diseñado para superindividuos modernos.",
  welcomeTiming: "Tarda entre 3 y 5 minutos. Después comenzarás a crear tu primer empleado digital.",
  begin: "Preparar mi espacio de trabajo",
  installEyebrow: "Paso 2",
  installTitle: "Instalar OpenClaw",
  installBody: "Comprobaremos si OpenClaw ya está instalado y lo configuraremos por ti",
  installDetected: "ChillClaw ya encontró un runtime compatible de OpenClaw en este Mac.",
  installMissing: "ChillClaw aún no encontró OpenClaw. Instalará la versión más reciente disponible para este usuario.",
  installCta: "Instalar OpenClaw",
  installUseExisting: "Usar OpenClaw existente",
  installContinue: "Siguiente",
  installSuccess: "OpenClaw está listo. Continúa con la configuración del modelo.",
  installFoundTitle: "Se detectó un OpenClaw compatible",
  installFoundBody: "Este Mac ya tiene OpenClaw listo. ChillClaw puede seguir usándolo.",
  installNotFoundTitle: "OpenClaw no encontrado",
  installNotFoundBody: "No te preocupes. Lo instalaremos por ti en solo unos clics.",
  installInstallingTitle: "Instalando OpenClaw...",
  installInstallingBody: "Esto tardará 2–3 minutos. No cierres esta ventana.",
  installCompleteTitle: "¡Instalación completa!",
  installCompleteBody: "OpenClaw está instalado y listo para configurarse",
  installVersionLabel: "Versión",
  installStageDetecting: "Comprobando este Mac...",
  installStageReusing: "Reutilizando el runtime existente...",
  installStageInstalling: "Instalando OpenClaw...",
  installStageVerifying: "Configurando servicios...",
  installStageRestarting: "Iniciando servicios locales...",
  modelEyebrow: "Paso 3",
  modelTitle: "Elige tu modelo de IA",
  modelBody: "Selecciona un proveedor de IA para impulsar a tus empleados digitales",
  localAiTitle: "Usar IA local en esta Mac",
  localAiInstallCta: "Instalar IA local",
  localAiRepairCta: "Reparar IA local",
  localAiStorageLabel: "Necesita unos {gb} GB libres",
  localModelSetupTitle: "Detectar hardware y configurar modelo local",
  localModelSetupBody: "Revisaremos tu hardware e instalaremos un modelo de IA local",
  localModelDetectingTitle: "Detectando hardware...",
  localModelDetectingBody: "Analizando la capacidad de tu sistema para ejecutar modelos locales de IA",
  localModelUnsupportedTitle: "No se recomienda el modelo local",
  localModelUnsupportedBody: "Tu hardware no cumple con los requisitos mínimos recomendados para ejecutar modelos locales de IA con fluidez.",
  localModelUnsupportedCloudBody: "No te preocupes: puedes usar una potente IA en la nube.",
  localModelCloudFallbackCountdown: "Cambiando a la configuración de IA en la nube en 2 segundos...",
  localModelDetectStepLabel: "Detectar hardware",
  localModelPrepareStepLabel: "Preparar Ollama",
  localModelDownloadStepLabel: "Descargar modelo local",
  localModelConnectStepLabel: "Conectar ChillClaw a la IA local",
  localModelDownloadAmountLabel: "{downloaded} de {total} descargados",
  localModelDownloadRemainingLabel: "{remaining} restantes",
  localModelDownloadPercentLabel: "{percent}% completado",
  localModelDownloadResumeNote: "Puedes salir de esta pantalla. ChillClaw reanudará la descarga automáticamente si se interrumpe.",
  providerTitle: "Selecciona un proveedor para empezar",
  authTitle: "¿Cómo te gustaría conectarte?",
  authApiKeyLabel: "API Key",
  authApiKeyBody: "Usa tu API key para una configuración rápida",
  authOAuthLabel: "OAuth",
  authOAuthBody: "Conéctate de forma segura con tu cuenta",
  minimaxTutorialTitle: "Ver video tutorial",
  minimaxTutorialBody: "Aprende a obtener tu API Key en 2 minutos",
  minimaxTutorialModalTitle: "Cómo obtener tu API Key",
  minimaxTutorialModalBody: "Mira este tutorial rápido",
  minimaxTutorialFallbackTitle: "Tutorial en video próximamente",
  minimaxTutorialFallbackBody: "Por ahora, pulsa \"Obtener API Key\" para visitar el sitio del proveedor",
  minimaxTutorialClose: "Entendido, continuar",
  minimaxGetKeyTitle: "Obtén tu API Key",
  minimaxGetKeyBody: "Haz clic en el botón de abajo para visitar MiniMax",
  minimaxGetKeyCTA: "Ir a MiniMax",
  minimaxEnterKeyTitle: "Introduce aquí tu API Key",
  minimaxEnterKeyBody: "Pega la API Key que acabas de copiar",
  authProgressTitle: "Progreso de autenticación",
  openAuthWindow: "Abrir ventana de autenticación",
  submitAuthInput: "Completar autenticación",
  modelApiKeyTitle: "Ingresa tu API Key",
  modelApiKeyPlaceholder: "Pega tu API key aquí",
  modelApiKeyHelp: "Tu clave se cifra y se guarda de forma segura",
  modelGetApiKey: "Obtener API Key",
  modelSave: "Siguiente",
  modelSaved: "Tu primer modelo IA se guardó como modelo predeterminado del onboarding.",
  modelConnectedTitle: "¡Conexión exitosa!",
  modelConnectedBody: "Conectado a {provider}",
  channelEyebrow: "Paso 4",
  channelTitle: "Elige un canal de comunicación",
  channelBody: "Selecciona cómo quieres hablar con tus empleados digitales",
  channelPickerHint: "Selecciona un canal para empezar",
  channelSave: "Guardar canal",
  channelSaveContinue: "Guardar y continuar",
  channelSaved: "Configuración del canal guardada.",
  channelApplyHint: "Este canal quedó guardado correctamente y se activará cuando el gateway aplique los cambios pendientes.",
  channelTutorialTitle: "Ver video tutorial",
  channelTutorialBody: "Aprende a configurar este canal en pocos minutos",
  channelTutorialModalTitle: "Cómo configurar este canal",
  channelTutorialModalBody: "Mira este tutorial rápido",
  channelTutorialFallbackTitle: "Video tutorial próximamente",
  channelTutorialFallbackBody: "Por ahora, abre la plataforma o la documentación con el botón de abajo.",
  channelTutorialClose: "Entendido, continuar",
  channelDocumentationCta: "Abrir documentación",
  channelPlatformCta: "Abrir configuración",
  channelWechatInstructionsTitle: "Instrucciones para WeChat Work",
  channelWechatInstructionSteps: [
    "Abre la consola de administración de WeChat Work en https://work.weixin.qq.com/ e inicia sesión como administrador.",
    "Ve a Administración de aplicaciones → Aplicaciones → Crear aplicación.",
    "Configura el nombre de la aplicación y su icono.",
    "Copia el Corp ID, Agent ID y Secret desde la configuración."
  ],
  channelWechatCorpId: "Corp ID",
  channelWechatAgentId: "Bot ID",
  channelWechatSecret: "Secret",
  channelTelegramInstructionsTitle: "Instrucciones para Telegram",
  channelTelegramInstructionSteps: [
    "Abre Telegram y busca @BotFather.",
    "Envía /newbot para crear un nuevo bot.",
    "Copia el token que te entregue BotFather."
  ],
  channelTelegramToken: "Bot Token",
  channelFeishuTutorialTitle: "Ver video tutorial",
  channelFeishuTutorialBody: "Aprende a configurar Feishu en 3 minutos",
  channelFeishuPlatformTitle: "Iniciar configuración",
  channelFeishuPlatformBody: "Ve a Feishu y crea las credenciales de tu app",
  channelFeishuCredentialsTitle: "Introduce tus credenciales",
  channelFeishuCredentialsBody: "Pega el App ID y el App Secret que acabas de copiar",
  channelFeishuAppId: "App ID",
  channelFeishuAppSecret: "App Secret",
  channelSecretHelp: "Tus credenciales se cifran y se guardan localmente",
  employeeEyebrow: "Paso 6",
  employeeTitle: "Crea tu primer empleado IA",
  employeeBody: "Elige avatar, rol y habilidades predeterminadas. ChillClaw crea un workspace real de agente OpenClaw detrás de este empleado.",
  employeeName: "Nombre del empleado",
  employeeRole: "Puesto",
  employeePreview: "Vista previa del empleado",
  createEmployee: "Crear empleado IA",
  employeeSaved: "Tu primer empleado IA está listo.",
  memoryOn: "Memoria activada",
  memoryOff: "Memoria desactivada",
  completeEyebrow: "Paso 7",
  completeTitle: "Tu espacio de trabajo está listo",
  completeBody: "ChillClaw terminó la configuración guiada. Elige a dónde quieres ir ahora.",
  completionInstall: "OpenClaw",
  completionModel: "Modelo",
  completionChannel: "Canal",
  completionEmployee: "Empleado IA",
  goTeam: "Abrir AI Team",
  goDashboard: "Abrir Dashboard",
  goChat: "Abrir Chat",
  saving: "Guardando",
  loading: "Cargando onboarding",
  required: "Obligatorio",
  chooseProvider: "Primero elige un proveedor",
  chooseChannel: "Primero elige un canal",
  chooseAvatar: "Elegir avatar",
  personalityTitle: "Personalidad",
  skillsTitle: "Conjuntos de habilidades predefinidos",
  pendingApplyTitle: "Aplicación del gateway pendiente",
  operationStillRunning: "ChillClaw sigue trabajando. Se actualizó el progreso desde el daemon y podrás continuar cuando este paso termine."
};

const onboardingCopyByLocale: Record<Locale, OnboardingCopy> = { en, zh, ja, ko, es };

export function onboardingCopy(locale: Locale): OnboardingCopy {
  return onboardingCopyByLocale[locale] ?? onboardingCopyByLocale.en;
}
