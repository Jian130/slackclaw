import type { Locale } from "../../shared/i18n/messages.js";

export interface OnboardingCopy {
  brand: string;
  subtitle: string;
  stepLabels: string[];
  welcomeEyebrow: string;
  welcomeTitle: string;
  welcomeBody: string;
  welcomeHighlights: Array<{ title: string; body: string }>;
  begin: string;
  installEyebrow: string;
  installTitle: string;
  installBody: string;
  installDetected: string;
  installMissing: string;
  installCta: string;
  installContinue: string;
  installSuccess: string;
  modelEyebrow: string;
  modelTitle: string;
  modelBody: string;
  providerTitle: string;
  authTitle: string;
  authProgressTitle: string;
  openAuthWindow: string;
  submitAuthInput: string;
  modelSave: string;
  modelSaved: string;
  channelEyebrow: string;
  channelTitle: string;
  channelBody: string;
  channelSave: string;
  channelSaved: string;
  channelApplyHint: string;
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
}

const en: OnboardingCopy = {
  brand: "SlackClaw Onboarding",
  subtitle: "Set up your OpenClaw workspace in one guided flow.",
  stepLabels: ["Welcome", "Install", "Model", "Channel", "AI Employee", "Complete"],
  welcomeEyebrow: "Get started",
  welcomeTitle: "Welcome to SlackClaw",
  welcomeBody: "SlackClaw handles installation, model setup, channel configuration, and your first AI employee in one clean guided process.",
  welcomeHighlights: [
    { title: "Install OpenClaw", body: "Reuse an existing compatible install or deploy the latest managed runtime for this Mac." },
    { title: "Configure the essentials", body: "Pick a model provider and one launch channel without dropping into terminal setup." },
    { title: "Create your first AI employee", body: "Give your first OpenClaw-backed employee a clear identity, memory policy, and starter skills." }
  ],
  begin: "Start setup",
  installEyebrow: "Step 2",
  installTitle: "Install or reuse OpenClaw",
  installBody: "SlackClaw detects whether this Mac already has a compatible OpenClaw runtime and only installs when needed.",
  installDetected: "SlackClaw already found a compatible OpenClaw runtime on this Mac.",
  installMissing: "SlackClaw did not find an OpenClaw runtime yet. It will install the latest available version for this user.",
  installCta: "Install now",
  installContinue: "Continue",
  installSuccess: "OpenClaw is ready. Continue to model setup.",
  modelEyebrow: "Step 3",
  modelTitle: "Configure your first AI model",
  modelBody: "Choose a provider, pick the model you want to use first, and finish the provider authentication flow if it is required.",
  providerTitle: "Choose provider",
  authTitle: "Authentication method",
  authProgressTitle: "Authentication progress",
  openAuthWindow: "Open authentication window",
  submitAuthInput: "Finish authentication",
  modelSave: "Save model",
  modelSaved: "Your first AI model is saved as the default onboarding model.",
  channelEyebrow: "Step 4",
  channelTitle: "Configure a launch channel",
  channelBody: "Pick one launch channel to stage its configuration. SlackClaw saves the correct config now and the gateway can apply it afterward.",
  channelSave: "Save channel",
  channelSaved: "Channel configuration saved.",
  channelApplyHint: "This channel is saved correctly and will become live after the gateway applies pending changes.",
  employeeEyebrow: "Step 5",
  employeeTitle: "Create your first AI employee",
  employeeBody: "Choose an avatar, role, personality, and starter skills. SlackClaw creates a real OpenClaw agent workspace behind this employee.",
  employeeName: "Employee name",
  employeeRole: "Job title",
  employeePreview: "Employee preview",
  createEmployee: "Create AI employee",
  employeeSaved: "Your first AI employee is ready.",
  memoryOn: "Memory enabled",
  memoryOff: "Memory disabled",
  completeEyebrow: "Step 6",
  completeTitle: "Your workspace is ready",
  completeBody: "SlackClaw finished the guided setup. Choose where you want to go next.",
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
  skillsTitle: "Starter skills",
  pendingApplyTitle: "Gateway apply pending"
};

const zh: OnboardingCopy = {
  brand: "SlackClaw 引导流程",
  subtitle: "用一个引导流程完成 OpenClaw 工作区搭建。",
  stepLabels: ["欢迎", "安装", "模型", "渠道", "AI 员工", "完成"],
  welcomeEyebrow: "开始使用",
  welcomeTitle: "欢迎来到 SlackClaw",
  welcomeBody: "SlackClaw 会在一个清晰的流程里完成安装、模型配置、渠道配置，以及第一个 AI 员工创建。",
  welcomeHighlights: [
    { title: "安装 OpenClaw", body: "优先复用现有兼容环境，否则为当前 Mac 安装最新可用运行时。" },
    { title: "配置核心能力", body: "选择模型供应商和一个启动渠道，不需要终端操作。" },
    { title: "创建首位 AI 员工", body: "为第一个 OpenClaw 驱动的员工配置身份、记忆策略和初始技能。" }
  ],
  begin: "开始设置",
  installEyebrow: "第 2 步",
  installTitle: "安装或复用 OpenClaw",
  installBody: "SlackClaw 会检测这台 Mac 是否已有兼容的 OpenClaw 运行时，仅在需要时安装。",
  installDetected: "SlackClaw 已在这台 Mac 上发现兼容的 OpenClaw 运行时。",
  installMissing: "SlackClaw 还未发现 OpenClaw 运行时，将为当前用户安装最新可用版本。",
  installCta: "立即安装",
  installContinue: "继续",
  installSuccess: "OpenClaw 已就绪，继续配置模型。",
  modelEyebrow: "第 3 步",
  modelTitle: "配置第一个 AI 模型",
  modelBody: "选择供应商，挑选想优先使用的模型，并完成需要的认证流程。",
  providerTitle: "选择供应商",
  authTitle: "认证方式",
  authProgressTitle: "认证进度",
  openAuthWindow: "打开认证窗口",
  submitAuthInput: "完成认证",
  modelSave: "保存模型",
  modelSaved: "首个 AI 模型已保存为默认引导模型。",
  channelEyebrow: "第 4 步",
  channelTitle: "配置一个启动渠道",
  channelBody: "选择一个启动渠道并保存配置。SlackClaw 现在只负责写入正确配置，稍后可由网关统一应用。",
  channelSave: "保存渠道",
  channelSaved: "渠道配置已保存。",
  channelApplyHint: "该渠道已正确保存，待网关应用挂起变更后即可生效。",
  employeeEyebrow: "第 5 步",
  employeeTitle: "创建第一个 AI 员工",
  employeeBody: "选择头像、角色、人格和初始技能。SlackClaw 会在后台创建真实的 OpenClaw agent 工作区。",
  employeeName: "员工名称",
  employeeRole: "职位名称",
  employeePreview: "员工预览",
  createEmployee: "创建 AI 员工",
  employeeSaved: "首位 AI 员工已准备就绪。",
  memoryOn: "已启用记忆",
  memoryOff: "已关闭记忆",
  completeEyebrow: "第 6 步",
  completeTitle: "你的工作区已准备完成",
  completeBody: "SlackClaw 已完成引导设置。选择你接下来想去的页面。",
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
  skillsTitle: "初始技能",
  pendingApplyTitle: "待应用网关变更"
};

const ja: OnboardingCopy = {
  brand: "SlackClaw オンボーディング",
  subtitle: "ひとつのガイドで OpenClaw ワークスペースをセットアップします。",
  stepLabels: ["開始", "インストール", "モデル", "チャネル", "AI 社員", "完了"],
  welcomeEyebrow: "スタート",
  welcomeTitle: "SlackClaw へようこそ",
  welcomeBody: "SlackClaw は、インストール、モデル設定、チャネル設定、最初の AI 社員作成までをひとつの流れで案内します。",
  welcomeHighlights: [
    { title: "OpenClaw を導入", body: "既存の互換環境を再利用し、必要な場合だけこの Mac に最新の実行環境を導入します。" },
    { title: "基本設定を完了", body: "モデルプロバイダーと開始用チャネルを選ぶだけで、ターミナル作業は不要です。" },
    { title: "最初の AI 社員を作成", body: "最初の OpenClaw エージェントに、役割、記憶方針、初期スキルを与えます。" }
  ],
  begin: "セットアップを開始",
  installEyebrow: "ステップ 2",
  installTitle: "OpenClaw をインストールまたは再利用",
  installBody: "SlackClaw はこの Mac に互換性のある OpenClaw があるかを確認し、必要な場合のみインストールします。",
  installDetected: "この Mac には既に互換性のある OpenClaw ランタイムがあります。",
  installMissing: "まだ OpenClaw ランタイムが見つかっていません。現在のユーザー向けに最新バージョンをインストールします。",
  installCta: "今すぐインストール",
  installContinue: "続行",
  installSuccess: "OpenClaw の準備ができました。次にモデルを設定します。",
  modelEyebrow: "ステップ 3",
  modelTitle: "最初の AI モデルを設定",
  modelBody: "プロバイダーを選び、最初に使うモデルを決め、必要な認証を完了してください。",
  providerTitle: "プロバイダーを選択",
  authTitle: "認証方式",
  authProgressTitle: "認証の進行状況",
  openAuthWindow: "認証ウィンドウを開く",
  submitAuthInput: "認証を完了",
  modelSave: "モデルを保存",
  modelSaved: "最初の AI モデルを既定モデルとして保存しました。",
  channelEyebrow: "ステップ 4",
  channelTitle: "開始用チャネルを設定",
  channelBody: "開始用チャネルをひとつ選んで設定を保存します。ライブ適用は後でゲートウェイが行います。",
  channelSave: "チャネルを保存",
  channelSaved: "チャネル設定を保存しました。",
  channelApplyHint: "このチャネル設定は保存済みです。保留中の変更をゲートウェイに適用すると有効になります。",
  employeeEyebrow: "ステップ 5",
  employeeTitle: "最初の AI 社員を作成",
  employeeBody: "アバター、役割、性格、初期スキルを選択します。SlackClaw が実際の OpenClaw エージェント環境を作成します。",
  employeeName: "社員名",
  employeeRole: "役職",
  employeePreview: "社員プレビュー",
  createEmployee: "AI 社員を作成",
  employeeSaved: "最初の AI 社員の準備ができました。",
  memoryOn: "メモリ有効",
  memoryOff: "メモリ無効",
  completeEyebrow: "ステップ 6",
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
  skillsTitle: "初期スキル",
  pendingApplyTitle: "ゲートウェイ適用待ち"
};

const ko: OnboardingCopy = {
  brand: "SlackClaw 온보딩",
  subtitle: "하나의 안내 흐름으로 OpenClaw 작업 공간을 설정합니다.",
  stepLabels: ["시작", "설치", "모델", "채널", "AI 직원", "완료"],
  welcomeEyebrow: "시작하기",
  welcomeTitle: "SlackClaw에 오신 것을 환영합니다",
  welcomeBody: "SlackClaw가 설치, 모델 설정, 채널 설정, 첫 AI 직원 생성까지 하나의 흐름으로 안내합니다.",
  welcomeHighlights: [
    { title: "OpenClaw 설치", body: "기존 호환 설치를 재사용하고, 필요할 때만 이 Mac에 최신 런타임을 설치합니다." },
    { title: "핵심 설정 완료", body: "모델 제공자와 시작 채널을 선택하면 되며 터미널 작업이 필요하지 않습니다." },
    { title: "첫 AI 직원 생성", body: "첫 OpenClaw 에이전트에 역할, 메모리 정책, 시작 스킬을 부여합니다." }
  ],
  begin: "설정 시작",
  installEyebrow: "2단계",
  installTitle: "OpenClaw 설치 또는 재사용",
  installBody: "SlackClaw는 이 Mac에 호환되는 OpenClaw 런타임이 있는지 확인하고 필요할 때만 설치합니다.",
  installDetected: "이 Mac에서 이미 호환되는 OpenClaw 런타임을 찾았습니다.",
  installMissing: "아직 OpenClaw 런타임이 없습니다. 현재 사용자를 위해 최신 버전을 설치합니다.",
  installCta: "지금 설치",
  installContinue: "계속",
  installSuccess: "OpenClaw 준비가 끝났습니다. 이제 모델을 설정하세요.",
  modelEyebrow: "3단계",
  modelTitle: "첫 AI 모델 설정",
  modelBody: "제공자를 선택하고 먼저 사용할 모델을 정한 뒤 필요한 인증을 완료하세요.",
  providerTitle: "제공자 선택",
  authTitle: "인증 방식",
  authProgressTitle: "인증 진행 상황",
  openAuthWindow: "인증 창 열기",
  submitAuthInput: "인증 완료",
  modelSave: "모델 저장",
  modelSaved: "첫 AI 모델이 기본 온보딩 모델로 저장되었습니다.",
  channelEyebrow: "4단계",
  channelTitle: "시작 채널 설정",
  channelBody: "시작 채널 하나를 선택해 구성을 저장합니다. 실제 적용은 이후 게이트웨이가 처리합니다.",
  channelSave: "채널 저장",
  channelSaved: "채널 구성이 저장되었습니다.",
  channelApplyHint: "이 채널은 올바르게 저장되었습니다. 게이트웨이가 대기 중인 변경을 적용하면 활성화됩니다.",
  employeeEyebrow: "5단계",
  employeeTitle: "첫 AI 직원 만들기",
  employeeBody: "아바타, 역할, 성격, 시작 스킬을 선택하세요. SlackClaw가 실제 OpenClaw 에이전트 작업 공간을 만듭니다.",
  employeeName: "직원 이름",
  employeeRole: "직무",
  employeePreview: "직원 미리보기",
  createEmployee: "AI 직원 만들기",
  employeeSaved: "첫 AI 직원이 준비되었습니다.",
  memoryOn: "메모리 사용",
  memoryOff: "메모리 끔",
  completeEyebrow: "6단계",
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
  skillsTitle: "시작 스킬",
  pendingApplyTitle: "게이트웨이 적용 대기"
};

const es: OnboardingCopy = {
  brand: "Onboarding de SlackClaw",
  subtitle: "Configura tu espacio de trabajo OpenClaw en un solo flujo guiado.",
  stepLabels: ["Inicio", "Instalar", "Modelo", "Canal", "Empleado IA", "Completo"],
  welcomeEyebrow: "Comenzar",
  welcomeTitle: "Bienvenido a SlackClaw",
  welcomeBody: "SlackClaw guía la instalación, la configuración del modelo, la configuración del canal y la creación de tu primer empleado IA en un solo proceso.",
  welcomeHighlights: [
    { title: "Instalar OpenClaw", body: "Reutiliza una instalación compatible existente o despliega la versión más reciente para este Mac." },
    { title: "Configurar lo esencial", body: "Elige un proveedor de modelo y un canal inicial sin depender del terminal." },
    { title: "Crear tu primer empleado IA", body: "Da identidad, política de memoria y habilidades iniciales a tu primer empleado basado en OpenClaw." }
  ],
  begin: "Iniciar configuración",
  installEyebrow: "Paso 2",
  installTitle: "Instalar o reutilizar OpenClaw",
  installBody: "SlackClaw detecta si este Mac ya tiene un entorno OpenClaw compatible y solo instala cuando hace falta.",
  installDetected: "SlackClaw ya encontró un entorno OpenClaw compatible en este Mac.",
  installMissing: "SlackClaw aún no encontró OpenClaw. Instalará la versión más reciente disponible para este usuario.",
  installCta: "Instalar ahora",
  installContinue: "Continuar",
  installSuccess: "OpenClaw está listo. Continúa con la configuración del modelo.",
  modelEyebrow: "Paso 3",
  modelTitle: "Configura tu primer modelo IA",
  modelBody: "Elige un proveedor, selecciona el modelo que quieres usar primero y completa el flujo de autenticación si hace falta.",
  providerTitle: "Elegir proveedor",
  authTitle: "Método de autenticación",
  authProgressTitle: "Progreso de autenticación",
  openAuthWindow: "Abrir ventana de autenticación",
  submitAuthInput: "Completar autenticación",
  modelSave: "Guardar modelo",
  modelSaved: "Tu primer modelo IA se guardó como modelo predeterminado del onboarding.",
  channelEyebrow: "Paso 4",
  channelTitle: "Configura un canal inicial",
  channelBody: "Elige un canal inicial y guarda su configuración. SlackClaw guarda la configuración correcta ahora y el gateway puede aplicarla después.",
  channelSave: "Guardar canal",
  channelSaved: "Configuración del canal guardada.",
  channelApplyHint: "Este canal quedó guardado correctamente y se activará cuando el gateway aplique los cambios pendientes.",
  employeeEyebrow: "Paso 5",
  employeeTitle: "Crea tu primer empleado IA",
  employeeBody: "Elige avatar, rol, personalidad y habilidades iniciales. SlackClaw crea un workspace real de agente OpenClaw detrás de este empleado.",
  employeeName: "Nombre del empleado",
  employeeRole: "Puesto",
  employeePreview: "Vista previa del empleado",
  createEmployee: "Crear empleado IA",
  employeeSaved: "Tu primer empleado IA está listo.",
  memoryOn: "Memoria activada",
  memoryOff: "Memoria desactivada",
  completeEyebrow: "Paso 6",
  completeTitle: "Tu espacio de trabajo está listo",
  completeBody: "SlackClaw terminó la configuración guiada. Elige a dónde quieres ir ahora.",
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
  skillsTitle: "Habilidades iniciales",
  pendingApplyTitle: "Aplicación del gateway pendiente"
};

const onboardingCopyByLocale: Record<Locale, OnboardingCopy> = { en, zh, ja, ko, es };

export function onboardingCopy(locale: Locale): OnboardingCopy {
  return onboardingCopyByLocale[locale] ?? onboardingCopyByLocale.en;
}
