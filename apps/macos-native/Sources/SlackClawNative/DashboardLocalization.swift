import CoreGraphics
import Foundation

let nativeDashboardMetricCardMinHeight: CGFloat = 170

struct NativeDashboardCopy: Sendable {
    let brandSubtitle: String
    let dashboardTitle: String
    let dashboardSubtitle: String
    let createEmployee: String
    let openTeam: String
    let poweredByOpenClaw: String
    let workspaceActive: String
    let heroTitle: String
    let heroBody: String
    let employeeStatusTitle: String
    let viewAll: String
    let noMembersYet: String
    let recentActivityTitle: String
    let noRecentActivity: String
    let workspaceHealthTitle: String
    let sidebarStatusTitle: String
    let sidebarStatusReadySummary: String
    let engineMetricTitle: String
    let connectedModelsMetricTitle: String
    let aiMembersMetricTitle: String
    let activeTasksMetricTitle: String
    let channelsReadyMetricTitle: String
    let engineInstalled: String
    let engineMissing: String
    let openClawNotInstalled: String
    let noConfiguredModels: String
    let inProgress: String
    let openClawDeployedTitle: String
    let gatewayReachableTitle: String
    let channelsConfiguredTitle: String
    let healthBlockersTitle: String
    let aiMemberRosterTitle: String
    let healthActive: String
    let healthMissing: String
    let healthRunning: String
    let healthStopped: String
    let healthPending: String
    let healthReview: String
    let healthClear: String
    let readyStatus: String
    let busyStatus: String
    let defaultActivityMemberName: String
    let readyBusyTemplate: String
    let activeCountTemplate: String
    let readyCountTemplate: String
    let memberCountTemplate: String
}

func nativeDashboardCopy(localeIdentifier: String = resolveNativeOnboardingLocaleIdentifier()) -> NativeDashboardCopy {
    switch resolveNativeOnboardingLocaleIdentifier(localeIdentifier) {
    case "zh":
        return .init(
            brandSubtitle: "让 OpenClaw 更易用",
            dashboardTitle: "仪表盘",
            dashboardSubtitle: "在一个界面查看工作区状态、AI 员工名单和最近活动。",
            createEmployee: "创建员工",
            openTeam: "打开团队",
            poweredByOpenClaw: "由 OpenClaw 驱动",
            workspaceActive: "工作区运行中",
            heroTitle: "Figma 外壳，后端真实数据",
            heroBody: "布局与 React 仪表盘保持一致，指标和列表继续由守护进程驱动。",
            employeeStatusTitle: "员工状态",
            viewAll: "查看全部",
            noMembersYet: "还没有 AI 员工。",
            recentActivityTitle: "最近活动",
            noRecentActivity: "暂无最近活动。",
            workspaceHealthTitle: "工作区健康状态",
            sidebarStatusTitle: "状态：运行中",
            sidebarStatusReadySummary: "所有系统运行正常",
            engineMetricTitle: "引擎",
            connectedModelsMetricTitle: "已连接模型",
            aiMembersMetricTitle: "AI 员工",
            activeTasksMetricTitle: "进行中的任务",
            channelsReadyMetricTitle: "已就绪渠道",
            engineInstalled: "已安装",
            engineMissing: "缺失",
            openClawNotInstalled: "OpenClaw 尚未安装。",
            noConfiguredModels: "没有已配置模型",
            inProgress: "进行中",
            openClawDeployedTitle: "OpenClaw 已部署",
            gatewayReachableTitle: "网关可达",
            channelsConfiguredTitle: "渠道已配置",
            healthBlockersTitle: "健康阻塞项",
            aiMemberRosterTitle: "AI 员工名单",
            healthActive: "运行中",
            healthMissing: "缺失",
            healthRunning: "运行中",
            healthStopped: "已停止",
            healthPending: "待处理",
            healthReview: "需要查看",
            healthClear: "正常",
            readyStatus: "就绪",
            busyStatus: "忙碌",
            defaultActivityMemberName: "ChillClaw",
            readyBusyTemplate: "{ready} 就绪 / {busy} 忙碌",
            activeCountTemplate: "{count} 个活动",
            readyCountTemplate: "{count} 个就绪",
            memberCountTemplate: "{count} 名成员"
        )
    case "ja":
        return .init(
            brandSubtitle: "OpenClaw をもっと簡単に",
            dashboardTitle: "ダッシュボード",
            dashboardSubtitle: "ワークスペースの状態、AI メンバー一覧、最近の動きを 1 画面で確認します。",
            createEmployee: "メンバーを作成",
            openTeam: "チームを開く",
            poweredByOpenClaw: "Powered by OpenClaw",
            workspaceActive: "ワークスペース稼働中",
            heroTitle: "Figma シェル、バックエンドの実データ",
            heroBody: "レイアウトは React ダッシュボードに合わせつつ、指標とリストはデーモンの実データを表示します。",
            employeeStatusTitle: "メンバー状況",
            viewAll: "すべて表示",
            noMembersYet: "AI メンバーはまだいません。",
            recentActivityTitle: "最近のアクティビティ",
            noRecentActivity: "最近のアクティビティはありません。",
            workspaceHealthTitle: "ワークスペースの健全性",
            sidebarStatusTitle: "状態: 稼働中",
            sidebarStatusReadySummary: "すべてのシステムは正常です",
            engineMetricTitle: "エンジン",
            connectedModelsMetricTitle: "接続済みモデル",
            aiMembersMetricTitle: "AI メンバー",
            activeTasksMetricTitle: "進行中のタスク",
            channelsReadyMetricTitle: "準備完了のチャネル",
            engineInstalled: "インストール済み",
            engineMissing: "未インストール",
            openClawNotInstalled: "OpenClaw はまだインストールされていません。",
            noConfiguredModels: "設定済みモデルはありません",
            inProgress: "進行中",
            openClawDeployedTitle: "OpenClaw 配備済み",
            gatewayReachableTitle: "ゲートウェイ到達可能",
            channelsConfiguredTitle: "チャネル設定",
            healthBlockersTitle: "健全性の阻害要因",
            aiMemberRosterTitle: "AI メンバー一覧",
            healthActive: "稼働中",
            healthMissing: "未検出",
            healthRunning: "実行中",
            healthStopped: "停止中",
            healthPending: "保留中",
            healthReview: "要確認",
            healthClear: "正常",
            readyStatus: "準備完了",
            busyStatus: "対応中",
            defaultActivityMemberName: "ChillClaw",
            readyBusyTemplate: "{ready} 準備完了 / {busy} 対応中",
            activeCountTemplate: "{count} 件の稼働中",
            readyCountTemplate: "{count} 件準備完了",
            memberCountTemplate: "{count} 人のメンバー"
        )
    case "ko":
        return .init(
            brandSubtitle: "OpenClaw를 더 쉽게",
            dashboardTitle: "대시보드",
            dashboardSubtitle: "하나의 화면에서 워크스페이스 상태, AI 멤버 목록, 최근 활동을 확인합니다.",
            createEmployee: "멤버 만들기",
            openTeam: "팀 열기",
            poweredByOpenClaw: "OpenClaw 기반",
            workspaceActive: "워크스페이스 활성",
            heroTitle: "Figma 셸, 백엔드 실데이터",
            heroBody: "레이아웃은 React 대시보드를 따르면서 지표와 목록은 데몬의 실제 상태를 보여줍니다.",
            employeeStatusTitle: "멤버 상태",
            viewAll: "전체 보기",
            noMembersYet: "아직 AI 멤버가 없습니다.",
            recentActivityTitle: "최근 활동",
            noRecentActivity: "최근 활동이 없습니다.",
            workspaceHealthTitle: "워크스페이스 상태",
            sidebarStatusTitle: "상태: 활성",
            sidebarStatusReadySummary: "모든 시스템이 정상 작동 중입니다",
            engineMetricTitle: "엔진",
            connectedModelsMetricTitle: "연결된 모델",
            aiMembersMetricTitle: "AI 멤버",
            activeTasksMetricTitle: "진행 중인 작업",
            channelsReadyMetricTitle: "준비된 채널",
            engineInstalled: "설치됨",
            engineMissing: "없음",
            openClawNotInstalled: "OpenClaw가 아직 설치되지 않았습니다.",
            noConfiguredModels: "구성된 모델이 없습니다",
            inProgress: "진행 중",
            openClawDeployedTitle: "OpenClaw 배포됨",
            gatewayReachableTitle: "게이트웨이 연결 가능",
            channelsConfiguredTitle: "채널 구성",
            healthBlockersTitle: "상태 차단 요소",
            aiMemberRosterTitle: "AI 멤버 명단",
            healthActive: "활성",
            healthMissing: "없음",
            healthRunning: "실행 중",
            healthStopped: "중지됨",
            healthPending: "대기 중",
            healthReview: "검토 필요",
            healthClear: "정상",
            readyStatus: "준비됨",
            busyStatus: "바쁨",
            defaultActivityMemberName: "ChillClaw",
            readyBusyTemplate: "{ready} 준비됨 / {busy} 바쁨",
            activeCountTemplate: "{count}개 활성",
            readyCountTemplate: "{count}개 준비됨",
            memberCountTemplate: "멤버 {count}명"
        )
    case "es":
        return .init(
            brandSubtitle: "OpenClaw sin complicaciones",
            dashboardTitle: "Panel",
            dashboardSubtitle: "Sigue el estado del espacio de trabajo, el equipo de IA y la actividad reciente en una sola vista.",
            createEmployee: "Crear miembro",
            openTeam: "Abrir equipo",
            poweredByOpenClaw: "Con tecnología de OpenClaw",
            workspaceActive: "Espacio activo",
            heroTitle: "Shell de Figma, estado real del backend",
            heroBody: "El diseño refleja el panel de React mientras las métricas y listas siguen respaldadas por el daemon.",
            employeeStatusTitle: "Estado del equipo",
            viewAll: "Ver todo",
            noMembersYet: "Todavía no hay miembros de IA.",
            recentActivityTitle: "Actividad reciente",
            noRecentActivity: "No hay actividad reciente.",
            workspaceHealthTitle: "Salud del espacio",
            sidebarStatusTitle: "Estado: Activo",
            sidebarStatusReadySummary: "Todos los sistemas están operativos",
            engineMetricTitle: "Motor",
            connectedModelsMetricTitle: "Modelos conectados",
            aiMembersMetricTitle: "Miembros de IA",
            activeTasksMetricTitle: "Tareas activas",
            channelsReadyMetricTitle: "Canales listos",
            engineInstalled: "Instalado",
            engineMissing: "Falta",
            openClawNotInstalled: "OpenClaw no está instalado.",
            noConfiguredModels: "No hay modelos configurados",
            inProgress: "En progreso",
            openClawDeployedTitle: "OpenClaw desplegado",
            gatewayReachableTitle: "Gateway accesible",
            channelsConfiguredTitle: "Canales configurados",
            healthBlockersTitle: "Bloqueos de salud",
            aiMemberRosterTitle: "Plantilla de IA",
            healthActive: "Activo",
            healthMissing: "Falta",
            healthRunning: "En ejecución",
            healthStopped: "Detenido",
            healthPending: "Pendiente",
            healthReview: "Revisar",
            healthClear: "Correcto",
            readyStatus: "Listo",
            busyStatus: "Ocupado",
            defaultActivityMemberName: "ChillClaw",
            readyBusyTemplate: "{ready} listos / {busy} ocupados",
            activeCountTemplate: "{count} activos",
            readyCountTemplate: "{count} listos",
            memberCountTemplate: "{count} miembros"
        )
    default:
        return .init(
            brandSubtitle: "OpenClaw Made Easy",
            dashboardTitle: "Dashboard",
            dashboardSubtitle: "Track your workspace status, AI member roster, and recent activity from one screen.",
            createEmployee: "Create Employee",
            openTeam: "Open Team",
            poweredByOpenClaw: "Powered by OpenClaw",
            workspaceActive: "Workspace active",
            heroTitle: "Figma shell, backend-truthful state",
            heroBody: "The layout mirrors the React dashboard while the metrics and lists stay daemon-backed.",
            employeeStatusTitle: "Employee Status",
            viewAll: "View all",
            noMembersYet: "No AI members yet.",
            recentActivityTitle: "Recent Activity",
            noRecentActivity: "No recent activity.",
            workspaceHealthTitle: "Workspace Health",
            sidebarStatusTitle: "Status: Active",
            sidebarStatusReadySummary: "All systems operational",
            engineMetricTitle: "Engine",
            connectedModelsMetricTitle: "Connected Models",
            aiMembersMetricTitle: "AI Members",
            activeTasksMetricTitle: "Active Tasks",
            channelsReadyMetricTitle: "Channels Ready",
            engineInstalled: "Installed",
            engineMissing: "Missing",
            openClawNotInstalled: "OpenClaw is not installed.",
            noConfiguredModels: "No configured models",
            inProgress: "In Progress",
            openClawDeployedTitle: "OpenClaw deployed",
            gatewayReachableTitle: "Gateway reachable",
            channelsConfiguredTitle: "Channels configured",
            healthBlockersTitle: "Health blockers",
            aiMemberRosterTitle: "AI member roster",
            healthActive: "Active",
            healthMissing: "Missing",
            healthRunning: "Running",
            healthStopped: "Stopped",
            healthPending: "Pending",
            healthReview: "Review",
            healthClear: "Clear",
            readyStatus: "ready",
            busyStatus: "busy",
            defaultActivityMemberName: "ChillClaw",
            readyBusyTemplate: "{ready} ready / {busy} busy",
            activeCountTemplate: "{count} active",
            readyCountTemplate: "{count} ready",
            memberCountTemplate: "{count} members"
        )
    }
}

func nativeSectionTitle(
    _ section: NativeSection,
    localeIdentifier: String = resolveNativeOnboardingLocaleIdentifier()
) -> String {
    switch resolveNativeOnboardingLocaleIdentifier(localeIdentifier) {
    case "zh":
        switch section {
        case .dashboard: return "仪表盘"
        case .deploy: return "部署"
        case .configuration: return "配置"
        case .plugins: return "插件"
        case .skills: return "技能管理"
        case .members: return "AI 员工"
        case .chat: return "聊天"
        case .team: return "AI 团队"
        case .settings: return "设置"
        }
    case "ja":
        switch section {
        case .dashboard: return "ダッシュボード"
        case .deploy: return "配備"
        case .configuration: return "設定"
        case .plugins: return "プラグイン"
        case .skills: return "スキル管理"
        case .members: return "AI メンバー"
        case .chat: return "チャット"
        case .team: return "AI チーム"
        case .settings: return "設定"
        }
    case "ko":
        switch section {
        case .dashboard: return "대시보드"
        case .deploy: return "배포"
        case .configuration: return "구성"
        case .plugins: return "플러그인"
        case .skills: return "스킬 관리"
        case .members: return "AI 멤버"
        case .chat: return "채팅"
        case .team: return "AI 팀"
        case .settings: return "설정"
        }
    case "es":
        switch section {
        case .dashboard: return "Panel"
        case .deploy: return "Despliegue"
        case .configuration: return "Configuración"
        case .plugins: return "Plugins"
        case .skills: return "Gestión de habilidades"
        case .members: return "Miembros de IA"
        case .chat: return "Chat"
        case .team: return "Equipo de IA"
        case .settings: return "Ajustes"
        }
    default:
        return section.rawValue
    }
}

extension NativeDashboardCopy {
    func readyBusySummary(ready: Int, busy: Int) -> String {
        replaceTokens(readyBusyTemplate, values: [
            "ready": String(ready),
            "busy": String(busy)
        ])
    }

    func activeCountLabel(_ count: Int) -> String {
        replaceTokens(activeCountTemplate, values: ["count": String(count)])
    }

    func readyChannelLabel(_ count: Int) -> String {
        replaceTokens(readyCountTemplate, values: ["count": String(count)])
    }

    func memberCountLabel(_ count: Int) -> String {
        replaceTokens(memberCountTemplate, values: ["count": String(count)])
    }

    func localizedMemberStatus(_ rawStatus: String) -> String {
        switch rawStatus {
        case "ready":
            return readyStatus
        case "busy":
            return busyStatus
        default:
            return rawStatus
        }
    }

    private func replaceTokens(_ template: String, values: [String: String]) -> String {
        values.reduce(template) { partial, item in
            partial.replacingOccurrences(of: "{\(item.key)}", with: item.value)
        }
    }
}
