import Foundation
import ChillClawProtocol

struct NativeAppUpdateCopy {
    let title: String
    let body: String
    let availableBadge: String
    let currentBadge: String
    let unavailableBadge: String
    let downloadFallback: String
    let releaseNotes: String
    let checkAgain: String

    let runtimeTitle: String
    let runtimeBody: String
    let runtimeCheck: String
}

struct NativeAppUpdatePresentation: Equatable {
    let title: String
    let summary: String
    let detail: String
    let badge: String
    let primaryActionTitle: String
    let secondaryActionTitle: String
    let downloadURL: URL?
    let releaseURL: URL?
}

func nativeAppUpdateCopy(localeIdentifier: String = resolveNativeOnboardingLocaleIdentifier()) -> NativeAppUpdateCopy {
    switch resolveNativeOnboardingLocaleIdentifier(localeIdentifier) {
    case "zh":
        return .init(
            title: "应用更新",
            body: "检查最新稳定版 ChillClaw macOS 安装包，并在有更新时打开已签名的安装包下载页。",
            availableBadge: "有可用更新",
            currentBadge: "当前版本",
            unavailableBadge: "不可用",
            downloadFallback: "下载更新",
            releaseNotes: "查看发布说明",
            checkAgain: "重新检查",
            runtimeTitle: "OpenClaw 运行时",
            runtimeBody: "单独检查 OpenClaw 运行时更新，避免与 ChillClaw 应用更新混淆。",
            runtimeCheck: "检查 OpenClaw 更新"
        )
    case "ja":
        return .init(
            title: "アプリ更新",
            body: "最新の安定版 ChillClaw macOS インストーラーを確認し、更新があれば署名済みパッケージのダウンロードを開きます。",
            availableBadge: "更新あり",
            currentBadge: "最新",
            unavailableBadge: "利用不可",
            downloadFallback: "更新をダウンロード",
            releaseNotes: "リリースノートを見る",
            checkAgain: "再確認",
            runtimeTitle: "OpenClaw ランタイム",
            runtimeBody: "ChillClaw 本体と混同しないよう、OpenClaw ランタイムの更新は別で確認します。",
            runtimeCheck: "OpenClaw 更新を確認"
        )
    case "ko":
        return .init(
            title: "앱 업데이트",
            body: "최신 안정판 ChillClaw macOS 설치 패키지를 확인하고, 업데이트가 있으면 서명된 설치 파일 다운로드를 엽니다.",
            availableBadge: "업데이트 가능",
            currentBadge: "최신 상태",
            unavailableBadge: "사용 불가",
            downloadFallback: "업데이트 다운로드",
            releaseNotes: "릴리스 노트 보기",
            checkAgain: "다시 확인",
            runtimeTitle: "OpenClaw 런타임",
            runtimeBody: "ChillClaw 앱 업데이트와 섞이지 않도록 OpenClaw 런타임 업데이트를 별도로 확인합니다.",
            runtimeCheck: "OpenClaw 업데이트 확인"
        )
    case "es":
        return .init(
            title: "Actualizaciones de la app",
            body: "Comprueba el instalador estable más reciente de ChillClaw para macOS y abre la descarga del paquete firmado cuando haya una actualización.",
            availableBadge: "Actualización disponible",
            currentBadge: "Actual",
            unavailableBadge: "No disponible",
            downloadFallback: "Descargar actualización",
            releaseNotes: "Ver notas de la versión",
            checkAgain: "Volver a comprobar",
            runtimeTitle: "Runtime de OpenClaw",
            runtimeBody: "Comprueba por separado las actualizaciones del runtime de OpenClaw para no mezclarlas con las de la app.",
            runtimeCheck: "Buscar actualizaciones de OpenClaw"
        )
    default:
        return .init(
            title: "App Updates",
            body: "Check the latest stable ChillClaw macOS installer and open the signed package download when an update is available.",
            availableBadge: "Update Available",
            currentBadge: "Current",
            unavailableBadge: "Unavailable",
            downloadFallback: "Download Update",
            releaseNotes: "View Release Notes",
            checkAgain: "Check Again",
            runtimeTitle: "OpenClaw Runtime",
            runtimeBody: "Check OpenClaw runtime updates separately so they never read like ChillClaw app updates.",
            runtimeCheck: "Check OpenClaw Updates"
        )
    }
}

func makeNativeAppUpdatePresentation(
    status: AppUpdateStatus?,
    localeIdentifier: String = resolveNativeOnboardingLocaleIdentifier()
) -> NativeAppUpdatePresentation {
    let copy = nativeAppUpdateCopy(localeIdentifier: localeIdentifier)
    let resolvedStatus = status ?? .unsupported()
    let versionLabel = resolvedStatus.latestVersion ?? resolvedStatus.currentVersion

    switch resolvedStatus.status {
    case "update-available":
        return .init(
            title: copy.title,
            summary: resolvedStatus.summary,
            detail: resolvedStatus.detail,
            badge: copy.availableBadge,
            primaryActionTitle: resolvedStatus.latestVersion.map { _ in "\(copy.downloadFallback.replacingOccurrences(of: "Update", with: "").trimmingCharacters(in: .whitespaces)) \(versionLabel)" } ?? copy.downloadFallback,
            secondaryActionTitle: copy.releaseNotes,
            downloadURL: resolvedStatus.downloadUrl.flatMap(URL.init(string:)),
            releaseURL: resolvedStatus.releaseUrl.flatMap(URL.init(string:))
        )
    case "up-to-date":
        return .init(
            title: copy.title,
            summary: resolvedStatus.summary,
            detail: resolvedStatus.detail,
            badge: copy.currentBadge,
            primaryActionTitle: copy.checkAgain,
            secondaryActionTitle: copy.releaseNotes,
            downloadURL: nil,
            releaseURL: resolvedStatus.releaseUrl.flatMap(URL.init(string:))
        )
    default:
        return .init(
            title: copy.title,
            summary: resolvedStatus.summary,
            detail: resolvedStatus.detail,
            badge: copy.unavailableBadge,
            primaryActionTitle: copy.checkAgain,
            secondaryActionTitle: copy.releaseNotes,
            downloadURL: resolvedStatus.downloadUrl.flatMap(URL.init(string:)),
            releaseURL: resolvedStatus.releaseUrl.flatMap(URL.init(string:))
        )
    }
}
