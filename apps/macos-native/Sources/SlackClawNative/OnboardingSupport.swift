import Foundation
import SwiftUI
import SlackClawProtocol

struct NativeOnboardingAvatarPreset: Identifiable, Sendable {
    let id: String
    let label: String
    let emoji: String
    let accent: String
    let theme: String
    let resourceName: String
}

let nativeOnboardingAvatarPresets: [NativeOnboardingAvatarPreset] = [
    .init(id: "onboarding-analyst", label: "Onboarding Analyst", emoji: "🧠", accent: "#97b5ea", theme: "onboarding", resourceName: "onboarding-analyst"),
    .init(id: "onboarding-strategist", label: "Onboarding Strategist", emoji: "🗺️", accent: "#a9bde8", theme: "onboarding", resourceName: "onboarding-strategist"),
    .init(id: "onboarding-builder", label: "Onboarding Builder", emoji: "🛠️", accent: "#9ec1ef", theme: "onboarding", resourceName: "onboarding-builder"),
    .init(id: "onboarding-guide", label: "Onboarding Guide", emoji: "✨", accent: "#a0c7ef", theme: "onboarding", resourceName: "onboarding-guide"),
    .init(id: "onboarding-visionary", label: "Onboarding Visionary", emoji: "🚀", accent: "#afc6f0", theme: "onboarding", resourceName: "onboarding-visionary"),
]

let nativeOnboardingTraits = [
    "Analytical",
    "Creative",
    "Strategic",
    "Empathetic",
    "Innovative",
    "Detail-Oriented",
    "Collaborative",
    "Assertive",
]

let nativeOnboardingChannelIDs: Set<String> = ["wechat", "feishu", "telegram"]
let nativeOnboardingStepOrder: [OnboardingStep] = [.welcome, .install, .model, .channel, .employee, .complete]
let nativeOnboardingPreferredColorScheme: ColorScheme = .light
let nativeOnboardingTextPrimary = Color(red: 0.09, green: 0.12, blue: 0.18)
let nativeOnboardingTextSecondary = Color(red: 0.41, green: 0.45, blue: 0.54)

struct NativeOnboardingEmployeeDraft: Sendable {
    var name: String
    var jobTitle: String
    var avatarPresetId: String
    var personalityTraits: [String]
    var skillIds: [String]
    var memoryEnabled: Bool
    var brainEntryId: String
}

func resolveOnboardingAvatarPreset(_ presetId: String?) -> NativeOnboardingAvatarPreset {
    nativeOnboardingAvatarPresets.first(where: { $0.id == presetId }) ?? nativeOnboardingAvatarPresets[0]
}

func onboardingDestinationSection(_ destination: OnboardingDestination) -> NativeSection {
    switch destination {
    case .team:
        return .team
    case .chat:
        return .chat
    case .dashboard:
        return .dashboard
    }
}

func buildOnboardingMemberRequest(_ draft: NativeOnboardingEmployeeDraft) -> SaveAIMemberRequest {
    let preset = resolveOnboardingAvatarPreset(draft.avatarPresetId)
    let personality = draft.personalityTraits.joined(separator: ", ")

    return .init(
        name: draft.name.trimmingCharacters(in: .whitespacesAndNewlines),
        jobTitle: draft.jobTitle.trimmingCharacters(in: .whitespacesAndNewlines),
        avatar: .init(
            presetId: preset.id,
            accent: preset.accent,
            emoji: preset.emoji,
            theme: preset.theme
        ),
        brainEntryId: draft.brainEntryId,
        personality: personality,
        soul: personality,
        workStyles: [],
        skillIds: draft.skillIds,
        knowledgePackIds: [],
        capabilitySettings: .init(memoryEnabled: draft.memoryEnabled, contextWindow: 128000)
    )
}

func onboardingStepIndex(_ step: OnboardingStep) -> Int {
    nativeOnboardingStepOrder.firstIndex(of: step) ?? 0
}

func onboardingIsCurrentOrLater(_ step: OnboardingStep, target: OnboardingStep) -> Bool {
    onboardingStepIndex(step) >= onboardingStepIndex(target)
}

func installDisposition(overview: ProductOverview?, setup: SetupRunResponse) -> String {
    if setup.install?.disposition == "reused-existing" {
        return "reused-existing"
    }

    if overview?.engine.installed == true {
        return "installed-managed"
    }

    return "not-installed"
}

func saveEntrySignature(_ entry: SavedModelEntry?) -> String {
    guard let entry else { return "" }
    return [
        entry.id,
        entry.providerId,
        entry.modelKey,
        entry.authMethodId ?? "",
        String(entry.isDefault),
        String(entry.isFallback),
        entry.updatedAt,
    ].joined(separator: "|")
}

func channelEntrySignature(_ entry: ConfiguredChannelEntry?) -> String {
    guard let entry else { return "" }
    return [
        entry.id,
        entry.channelId,
        entry.status,
        entry.summary,
        String(entry.pairingRequired),
        entry.lastUpdatedAt ?? "",
    ].joined(separator: "|")
}

func findCreatedSavedEntry(previousEntries: [SavedModelEntry], nextEntries: [SavedModelEntry]) -> SavedModelEntry? {
    nextEntries.first(where: { next in !previousEntries.contains(where: { $0.id == next.id }) })
}

func findCreatedChannelEntry(previousEntries: [ConfiguredChannelEntry], nextEntries: [ConfiguredChannelEntry]) -> ConfiguredChannelEntry? {
    nextEntries.first(where: { next in !previousEntries.contains(where: { $0.id == next.id }) })
}

func findCreatedMember(previousMembers: [AIMemberDetail], nextMembers: [AIMemberDetail]) -> AIMemberDetail? {
    nextMembers.first(where: { next in !previousMembers.contains(where: { $0.id == next.id }) })
}

struct NativeOnboardingHighlight: Sendable {
    let title: String
    let body: String
}

struct NativeOnboardingCopy: Sendable {
    let brand: String
    let subtitle: String
    let stepLabels: [String]
    let welcomeEyebrow: String
    let welcomeTitle: String
    let welcomeBody: String
    let welcomeHighlights: [NativeOnboardingHighlight]
    let begin: String
    let installTitle: String
    let installBody: String
    let installDetected: String
    let installMissing: String
    let installCta: String
    let installContinue: String
    let installSuccess: String
    let back: String
    let next: String
    let modelTitle: String
    let modelBody: String
    let providerTitle: String
    let authTitle: String
    let authProgressTitle: String
    let openAuthWindow: String
    let submitAuthInput: String
    let modelSave: String
    let modelSaved: String
    let chooseProvider: String
    let channelTitle: String
    let channelBody: String
    let channelSave: String
    let channelSaved: String
    let channelApplyHint: String
    let chooseChannel: String
    let employeeTitle: String
    let employeeBody: String
    let employeeName: String
    let employeeRole: String
    let employeePreview: String
    let chooseAvatar: String
    let personalityTitle: String
    let skillsTitle: String
    let createEmployee: String
    let employeeSaved: String
    let memoryOn: String
    let memoryOff: String
    let completeTitle: String
    let completeBody: String
    let completionInstall: String
    let completionModel: String
    let completionChannel: String
    let completionEmployee: String
    let goTeam: String
    let goDashboard: String
    let goChat: String
    let loading: String
    let saving: String
    let required: String
    let pendingApplyTitle: String
}

private enum NativeSupportedLocale: String {
    case en
    case zh
    case ja
    case ko
    case es
}

func nativeOnboardingCopy(localeIdentifier: String = Locale.preferredLanguages.first ?? "en") -> NativeOnboardingCopy {
    let locale = NativeSupportedLocale(rawValue: String(localeIdentifier.prefix(2))) ?? .en

    switch locale {
    case .zh:
        return .init(
            brand: "SlackClaw 引导流程",
            subtitle: "用一个引导流程完成 OpenClaw 工作区搭建。",
            stepLabels: ["欢迎", "安装", "模型", "渠道", "AI 员工", "完成"],
            welcomeEyebrow: "开始使用",
            welcomeTitle: "欢迎来到 SlackClaw",
            welcomeBody: "SlackClaw 会在一个清晰的流程里完成安装、模型配置、渠道配置，以及第一个 AI 员工创建。",
            welcomeHighlights: [
                .init(title: "安装 OpenClaw", body: "优先复用现有兼容环境，否则为当前 Mac 安装最新可用运行时。"),
                .init(title: "配置核心能力", body: "选择模型供应商和一个启动渠道，不需要终端操作。"),
                .init(title: "创建首位 AI 员工", body: "为第一个 OpenClaw 驱动的员工配置身份、记忆策略和初始技能。"),
            ],
            begin: "开始设置",
            installTitle: "安装或复用 OpenClaw",
            installBody: "SlackClaw 会检测这台 Mac 是否已有兼容的 OpenClaw 运行时，仅在需要时安装。",
            installDetected: "SlackClaw 已在这台 Mac 上发现兼容的 OpenClaw 运行时。",
            installMissing: "SlackClaw 还未发现 OpenClaw 运行时，将为当前用户安装最新可用版本。",
            installCta: "立即安装",
            installContinue: "继续",
            installSuccess: "OpenClaw 已就绪，继续配置模型。",
            back: "返回",
            next: "继续",
            modelTitle: "配置第一个 AI 模型",
            modelBody: "选择供应商、认证方式和首选模型。需要时完成交互认证流程。",
            providerTitle: "选择供应商",
            authTitle: "认证方式",
            authProgressTitle: "认证进度",
            openAuthWindow: "打开认证窗口",
            submitAuthInput: "完成认证",
            modelSave: "保存模型",
            modelSaved: "首个 AI 模型已保存为默认引导模型。",
            chooseProvider: "请先选择供应商",
            channelTitle: "配置一个启动渠道",
            channelBody: "选择一个启动渠道并保存配置。SlackClaw 现在只负责写入正确配置，稍后可由网关统一应用。",
            channelSave: "保存渠道",
            channelSaved: "渠道配置已保存。",
            channelApplyHint: "该渠道已正确保存，待网关应用挂起变更后即可生效。",
            chooseChannel: "请先选择渠道",
            employeeTitle: "创建第一个 AI 员工",
            employeeBody: "选择头像、角色、人格和初始技能。SlackClaw 会在后台创建真实的 OpenClaw agent 工作区。",
            employeeName: "员工名称",
            employeeRole: "职位名称",
            employeePreview: "员工预览",
            chooseAvatar: "选择头像",
            personalityTitle: "人格特征",
            skillsTitle: "初始技能",
            createEmployee: "创建 AI 员工",
            employeeSaved: "首位 AI 员工已准备就绪。",
            memoryOn: "已启用记忆",
            memoryOff: "已关闭记忆",
            completeTitle: "你的工作区已准备完成",
            completeBody: "SlackClaw 已完成引导设置。选择你接下来想去的页面。",
            completionInstall: "OpenClaw",
            completionModel: "模型",
            completionChannel: "渠道",
            completionEmployee: "AI 员工",
            goTeam: "进入 AI Team",
            goDashboard: "进入 Dashboard",
            goChat: "进入 Chat",
            loading: "正在加载引导流程",
            saving: "正在保存",
            required: "必填",
            pendingApplyTitle: "待应用网关变更"
        )
    case .ja:
        return .init(
            brand: "SlackClaw オンボーディング",
            subtitle: "ひとつのガイドで OpenClaw ワークスペースをセットアップします。",
            stepLabels: ["開始", "インストール", "モデル", "チャネル", "AI 社員", "完了"],
            welcomeEyebrow: "スタート",
            welcomeTitle: "SlackClaw へようこそ",
            welcomeBody: "SlackClaw は、インストール、モデル設定、チャネル設定、最初の AI 社員作成までをひとつの流れで案内します。",
            welcomeHighlights: [
                .init(title: "OpenClaw を導入", body: "既存の互換環境を再利用し、必要な場合だけこの Mac に最新の実行環境を導入します。"),
                .init(title: "基本設定を完了", body: "モデルプロバイダーと開始用チャネルを選ぶだけで、ターミナル作業は不要です。"),
                .init(title: "最初の AI 社員を作成", body: "最初の OpenClaw エージェントに役割、記憶方針、初期スキルを与えます。"),
            ],
            begin: "セットアップを開始",
            installTitle: "OpenClaw をインストールまたは再利用",
            installBody: "SlackClaw はこの Mac に互換性のある OpenClaw があるかを確認し、必要な場合のみインストールします。",
            installDetected: "この Mac には既に互換性のある OpenClaw ランタイムがあります。",
            installMissing: "まだ OpenClaw ランタイムが見つかっていません。現在のユーザー向けに最新バージョンをインストールします。",
            installCta: "今すぐインストール",
            installContinue: "続ける",
            installSuccess: "OpenClaw の準備ができました。モデル設定へ進みます。",
            back: "戻る",
            next: "次へ",
            modelTitle: "最初の AI モデルを設定",
            modelBody: "プロバイダー、認証方式、最初に使うモデルを選択します。必要な場合は対話型認証を完了します。",
            providerTitle: "プロバイダーを選択",
            authTitle: "認証方法",
            authProgressTitle: "認証の進行状況",
            openAuthWindow: "認証ウィンドウを開く",
            submitAuthInput: "認証を完了",
            modelSave: "モデルを保存",
            modelSaved: "最初の AI モデルはオンボーディングの既定モデルとして保存されました。",
            chooseProvider: "先にプロバイダーを選択してください",
            channelTitle: "開始用チャネルを設定",
            channelBody: "開始用チャネルを 1 つ選んで設定を保存します。ゲートウェイへの反映はあとで行えます。",
            channelSave: "チャネルを保存",
            channelSaved: "チャネル設定を保存しました。",
            channelApplyHint: "このチャネルは正しく保存されました。ゲートウェイが保留中の変更を適用すると有効になります。",
            chooseChannel: "先にチャネルを選択してください",
            employeeTitle: "最初の AI 社員を作成",
            employeeBody: "アバター、役割、性格、初期スキルを選択します。SlackClaw が実際の OpenClaw エージェントを作成します。",
            employeeName: "社員名",
            employeeRole: "役職",
            employeePreview: "社員プレビュー",
            chooseAvatar: "アバターを選択",
            personalityTitle: "性格",
            skillsTitle: "初期スキル",
            createEmployee: "AI 社員を作成",
            employeeSaved: "最初の AI 社員の準備ができました。",
            memoryOn: "記憶を有効",
            memoryOff: "記憶を無効",
            completeTitle: "ワークスペースの準備ができました",
            completeBody: "SlackClaw のガイド設定が完了しました。次に進む先を選んでください。",
            completionInstall: "OpenClaw",
            completionModel: "モデル",
            completionChannel: "チャネル",
            completionEmployee: "AI 社員",
            goTeam: "AI Team を開く",
            goDashboard: "Dashboard を開く",
            goChat: "Chat を開く",
            loading: "オンボーディングを読み込み中",
            saving: "保存中",
            required: "必須",
            pendingApplyTitle: "ゲートウェイへの反映待ち"
        )
    case .ko:
        return .init(
            brand: "SlackClaw 온보딩",
            subtitle: "하나의 가이드 흐름으로 OpenClaw 작업공간을 설정합니다.",
            stepLabels: ["시작", "설치", "모델", "채널", "AI 직원", "완료"],
            welcomeEyebrow: "시작하기",
            welcomeTitle: "SlackClaw에 오신 것을 환영합니다",
            welcomeBody: "SlackClaw는 설치, 모델 설정, 채널 설정, 첫 AI 직원 생성을 하나의 흐름으로 안내합니다.",
            welcomeHighlights: [
                .init(title: "OpenClaw 설치", body: "기존 호환 환경을 우선 재사용하고 필요할 때만 이 Mac에 최신 런타임을 설치합니다."),
                .init(title: "핵심 설정 완료", body: "모델 공급자와 시작 채널을 선택하기만 하면 되며 터미널 작업이 필요 없습니다."),
                .init(title: "첫 AI 직원 생성", body: "첫 OpenClaw 에이전트에 역할, 메모리 정책, 시작 스킬을 부여합니다."),
            ],
            begin: "설정 시작",
            installTitle: "OpenClaw 설치 또는 재사용",
            installBody: "SlackClaw는 이 Mac에 호환되는 OpenClaw 런타임이 있는지 확인하고 필요할 때만 설치합니다.",
            installDetected: "이 Mac에서 이미 호환되는 OpenClaw 런타임을 찾았습니다.",
            installMissing: "아직 OpenClaw 런타임이 없습니다. 현재 사용자용 최신 버전을 설치합니다.",
            installCta: "지금 설치",
            installContinue: "계속",
            installSuccess: "OpenClaw가 준비되었습니다. 모델 설정으로 계속합니다.",
            back: "뒤로",
            next: "다음",
            modelTitle: "첫 AI 모델 구성",
            modelBody: "공급자, 인증 방법, 처음 사용할 모델을 선택합니다. 필요하면 상호작용 인증을 완료합니다.",
            providerTitle: "공급자 선택",
            authTitle: "인증 방법",
            authProgressTitle: "인증 진행 상황",
            openAuthWindow: "인증 창 열기",
            submitAuthInput: "인증 완료",
            modelSave: "모델 저장",
            modelSaved: "첫 AI 모델이 온보딩 기본 모델로 저장되었습니다.",
            chooseProvider: "먼저 공급자를 선택하세요",
            channelTitle: "시작 채널 구성",
            channelBody: "시작 채널 하나를 선택해 설정을 저장합니다. 게이트웨이 적용은 나중에 할 수 있습니다.",
            channelSave: "채널 저장",
            channelSaved: "채널 설정이 저장되었습니다.",
            channelApplyHint: "이 채널은 올바르게 저장되었으며 게이트웨이가 보류 중인 변경을 적용하면 활성화됩니다.",
            chooseChannel: "먼저 채널을 선택하세요",
            employeeTitle: "첫 AI 직원 만들기",
            employeeBody: "아바타, 역할, 성격, 시작 스킬을 선택합니다. SlackClaw가 실제 OpenClaw 에이전트를 생성합니다.",
            employeeName: "직원 이름",
            employeeRole: "직무명",
            employeePreview: "직원 미리보기",
            chooseAvatar: "아바타 선택",
            personalityTitle: "성격",
            skillsTitle: "시작 스킬",
            createEmployee: "AI 직원 만들기",
            employeeSaved: "첫 AI 직원이 준비되었습니다.",
            memoryOn: "메모리 활성화",
            memoryOff: "메모리 비활성화",
            completeTitle: "작업공간이 준비되었습니다",
            completeBody: "SlackClaw 가이드 설정이 완료되었습니다. 다음에 갈 곳을 선택하세요.",
            completionInstall: "OpenClaw",
            completionModel: "모델",
            completionChannel: "채널",
            completionEmployee: "AI 직원",
            goTeam: "AI Team 열기",
            goDashboard: "Dashboard 열기",
            goChat: "Chat 열기",
            loading: "온보딩 불러오는 중",
            saving: "저장 중",
            required: "필수",
            pendingApplyTitle: "게이트웨이 적용 대기 중"
        )
    case .es:
        return .init(
            brand: "Onboarding de SlackClaw",
            subtitle: "Configura tu espacio de trabajo de OpenClaw en un solo flujo guiado.",
            stepLabels: ["Inicio", "Instalar", "Modelo", "Canal", "Empleado IA", "Completo"],
            welcomeEyebrow: "Comenzar",
            welcomeTitle: "Bienvenido a SlackClaw",
            welcomeBody: "SlackClaw reúne la instalación, la configuración del modelo, del canal y la creación de tu primer empleado IA en un solo flujo.",
            welcomeHighlights: [
                .init(title: "Instalar OpenClaw", body: "Reutiliza una instalación compatible existente o instala el runtime administrado más reciente para este Mac."),
                .init(title: "Configurar lo esencial", body: "Elige un proveedor de modelos y un canal inicial sin usar la terminal."),
                .init(title: "Crear tu primer empleado IA", body: "Dale a tu primer agente de OpenClaw una identidad, política de memoria y habilidades iniciales."),
            ],
            begin: "Comenzar configuración",
            installTitle: "Instalar o reutilizar OpenClaw",
            installBody: "SlackClaw detecta si este Mac ya tiene un runtime compatible de OpenClaw y solo instala cuando hace falta.",
            installDetected: "SlackClaw ya encontró un runtime compatible de OpenClaw en este Mac.",
            installMissing: "SlackClaw aún no encontró un runtime de OpenClaw. Instalará la versión más reciente disponible para este usuario.",
            installCta: "Instalar ahora",
            installContinue: "Continuar",
            installSuccess: "OpenClaw está listo. Continúa con la configuración del modelo.",
            back: "Atrás",
            next: "Siguiente",
            modelTitle: "Configura tu primer modelo IA",
            modelBody: "Elige un proveedor, un método de autenticación y el modelo que usarás primero. Completa la autenticación interactiva si hace falta.",
            providerTitle: "Elegir proveedor",
            authTitle: "Método de autenticación",
            authProgressTitle: "Progreso de autenticación",
            openAuthWindow: "Abrir ventana de autenticación",
            submitAuthInput: "Finalizar autenticación",
            modelSave: "Guardar modelo",
            modelSaved: "Tu primer modelo IA se guardó como modelo predeterminado del onboarding.",
            chooseProvider: "Primero elige un proveedor",
            channelTitle: "Configura un canal de inicio",
            channelBody: "Elige un canal de inicio para guardar su configuración. El gateway podrá aplicar esos cambios después.",
            channelSave: "Guardar canal",
            channelSaved: "Configuración del canal guardada.",
            channelApplyHint: "Este canal quedó guardado correctamente y estará activo cuando el gateway aplique los cambios pendientes.",
            chooseChannel: "Primero elige un canal",
            employeeTitle: "Crea tu primer empleado IA",
            employeeBody: "Elige un avatar, rol, personalidad y habilidades iniciales. SlackClaw crea un espacio real de agente OpenClaw detrás de este empleado.",
            employeeName: "Nombre del empleado",
            employeeRole: "Puesto",
            employeePreview: "Vista previa del empleado",
            chooseAvatar: "Elegir avatar",
            personalityTitle: "Personalidad",
            skillsTitle: "Habilidades iniciales",
            createEmployee: "Crear empleado IA",
            employeeSaved: "Tu primer empleado IA está listo.",
            memoryOn: "Memoria activada",
            memoryOff: "Memoria desactivada",
            completeTitle: "Tu espacio de trabajo está listo",
            completeBody: "SlackClaw terminó la configuración guiada. Elige a dónde quieres ir ahora.",
            completionInstall: "OpenClaw",
            completionModel: "Modelo",
            completionChannel: "Canal",
            completionEmployee: "Empleado IA",
            goTeam: "Abrir AI Team",
            goDashboard: "Abrir Dashboard",
            goChat: "Abrir Chat",
            loading: "Cargando onboarding",
            saving: "Guardando",
            required: "Obligatorio",
            pendingApplyTitle: "Aplicación del gateway pendiente"
        )
    case .en:
        return .init(
            brand: "SlackClaw Onboarding",
            subtitle: "Set up your OpenClaw workspace in one guided flow.",
            stepLabels: ["Welcome", "Install", "Model", "Channel", "AI Employee", "Complete"],
            welcomeEyebrow: "Get started",
            welcomeTitle: "Welcome to SlackClaw",
            welcomeBody: "SlackClaw handles installation, model setup, channel configuration, and your first AI employee in one clean guided process.",
            welcomeHighlights: [
                .init(title: "Install OpenClaw", body: "Reuse an existing compatible install or deploy the latest managed runtime for this Mac."),
                .init(title: "Configure the essentials", body: "Pick a model provider and one launch channel without dropping into terminal setup."),
                .init(title: "Create your first AI employee", body: "Give your first OpenClaw-backed employee a clear identity, memory policy, and starter skills."),
            ],
            begin: "Start setup",
            installTitle: "Install or reuse OpenClaw",
            installBody: "SlackClaw detects whether this Mac already has a compatible OpenClaw runtime and only installs when needed.",
            installDetected: "SlackClaw already found a compatible OpenClaw runtime on this Mac.",
            installMissing: "SlackClaw did not find an OpenClaw runtime yet. It will install the latest available version for this user.",
            installCta: "Install now",
            installContinue: "Continue",
            installSuccess: "OpenClaw is ready. Continue to model setup.",
            back: "Back",
            next: "Next",
            modelTitle: "Configure your first AI model",
            modelBody: "Choose a provider, pick the model you want to use first, and finish the provider authentication flow if it is required.",
            providerTitle: "Choose provider",
            authTitle: "Authentication method",
            authProgressTitle: "Authentication progress",
            openAuthWindow: "Open authentication window",
            submitAuthInput: "Finish authentication",
            modelSave: "Save model",
            modelSaved: "Your first AI model is saved as the default onboarding model.",
            chooseProvider: "Choose a provider first",
            channelTitle: "Configure a launch channel",
            channelBody: "Pick one launch channel to stage its configuration. SlackClaw saves the correct config now and the gateway can apply it afterward.",
            channelSave: "Save channel",
            channelSaved: "Channel configuration saved.",
            channelApplyHint: "This channel is saved correctly and will become live after the gateway applies pending changes.",
            chooseChannel: "Choose a channel first",
            employeeTitle: "Create your first AI employee",
            employeeBody: "Choose an avatar, role, personality, and starter skills. SlackClaw creates a real OpenClaw agent workspace behind this employee.",
            employeeName: "Employee name",
            employeeRole: "Job title",
            employeePreview: "Employee preview",
            chooseAvatar: "Choose avatar",
            personalityTitle: "Personality",
            skillsTitle: "Starter skills",
            createEmployee: "Create AI employee",
            employeeSaved: "Your first AI employee is ready.",
            memoryOn: "Memory enabled",
            memoryOff: "Memory disabled",
            completeTitle: "Your workspace is ready",
            completeBody: "SlackClaw finished the guided setup. Choose where you want to go next.",
            completionInstall: "OpenClaw",
            completionModel: "Model",
            completionChannel: "Channel",
            completionEmployee: "AI employee",
            goTeam: "Open AI Team",
            goDashboard: "Open Dashboard",
            goChat: "Open Chat",
            loading: "Loading onboarding",
            saving: "Saving",
            required: "Required",
            pendingApplyTitle: "Gateway apply pending"
        )
    }
}

func onboardingAssetImage(_ presetId: String) -> Image? {
    let preset = resolveOnboardingAvatarPreset(presetId)
    return Image(preset.resourceName, bundle: .module)
}
