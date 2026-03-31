import AppKit
import ApplicationServices
import AVFoundation
import CoreGraphics
import CoreLocation
import Foundation
import Observation
import Speech
import UserNotifications

enum NativePermissionCapability: String, CaseIterable, Sendable {
    case appleScript
    case notifications
    case accessibility
    case screenRecording
    case microphone
    case speechRecognition
    case camera
    case location
}

struct NativePermissionsCopy: Sendable {
    let onboardingTitle: String
    let sharedBody: String
    let settingsTitle: String
    let settingsBody: String
    let grantButton: String
    let grantedLabel: String
    let requestAccess: String
    let refreshButton: String
    let checking: String
}

struct NativePermissionMetadataItem: Identifiable, Sendable {
    let capability: NativePermissionCapability
    let title: String
    let subtitle: String
    let systemImage: String

    var id: NativePermissionCapability {
        capability
    }
}

func nativePermissionsCopy(localeIdentifier: String = resolveNativeOnboardingLocaleIdentifier()) -> NativePermissionsCopy {
    switch resolveNativeOnboardingLocaleIdentifier(localeIdentifier) {
    case "zh":
        return .init(
            onboardingTitle: "授予权限",
            sharedBody: "允许这些权限，以便 ChillClaw 在需要时进行提醒和捕获。",
            settingsTitle: "权限",
            settingsBody: "管理 ChillClaw 在这台 Mac 上请求的系统权限。",
            grantButton: "授权",
            grantedLabel: "已授权",
            requestAccess: "请求访问",
            refreshButton: "刷新",
            checking: "检查中…"
        )
    case "ja":
        return .init(
            onboardingTitle: "権限を許可",
            sharedBody: "必要なときに ChillClaw が通知と取得を行えるよう、以下の権限を許可してください。",
            settingsTitle: "権限",
            settingsBody: "この Mac で ChillClaw が要求するシステム権限を管理します。",
            grantButton: "許可",
            grantedLabel: "許可済み",
            requestAccess: "アクセスを要求",
            refreshButton: "更新",
            checking: "確認中…"
        )
    case "ko":
        return .init(
            onboardingTitle: "권한 허용",
            sharedBody: "필요할 때 ChillClaw가 알림을 보내고 화면을 가져올 수 있도록 아래 권한을 허용하세요.",
            settingsTitle: "권한",
            settingsBody: "이 Mac에서 ChillClaw가 요청하는 시스템 권한을 관리합니다.",
            grantButton: "허용",
            grantedLabel: "허용됨",
            requestAccess: "접근 요청",
            refreshButton: "새로고침",
            checking: "확인 중…"
        )
    case "es":
        return .init(
            onboardingTitle: "Conceder permisos",
            sharedBody: "Permite estos accesos para que ChillClaw pueda notificar y capturar contexto cuando haga falta.",
            settingsTitle: "Permisos",
            settingsBody: "Administra los permisos del sistema que ChillClaw solicita en esta Mac.",
            grantButton: "Conceder",
            grantedLabel: "Concedido",
            requestAccess: "Solicitar acceso",
            refreshButton: "Actualizar",
            checking: "Comprobando…"
        )
    default:
        return .init(
            onboardingTitle: "Grant permissions",
            sharedBody: "Allow these so ChillClaw can notify and capture when needed.",
            settingsTitle: "Permissions",
            settingsBody: "Manage the macOS permissions ChillClaw requests on this Mac.",
            grantButton: "Grant",
            grantedLabel: "Granted",
            requestAccess: "Request access",
            refreshButton: "Refresh",
            checking: "Checking…"
        )
    }
}

func nativePermissionMetadata(localeIdentifier: String = resolveNativeOnboardingLocaleIdentifier()) -> [NativePermissionMetadataItem] {
    switch resolveNativeOnboardingLocaleIdentifier(localeIdentifier) {
    case "zh":
        return [
            .init(capability: .appleScript, title: "自动化 (AppleScript)", subtitle: "控制其他应用（例如 Terminal）来执行自动化操作", systemImage: "applescript"),
            .init(capability: .notifications, title: "通知", subtitle: "为代理活动显示桌面提醒", systemImage: "bell"),
            .init(capability: .accessibility, title: "辅助功能", subtitle: "在操作需要时控制界面元素", systemImage: "hand.raised"),
            .init(capability: .screenRecording, title: "屏幕录制", subtitle: "为上下文或截图捕获屏幕", systemImage: "display"),
            .init(capability: .microphone, title: "麦克风", subtitle: "允许语音唤醒和音频采集", systemImage: "mic"),
            .init(capability: .speechRecognition, title: "语音识别", subtitle: "在设备上转写语音唤醒触发词", systemImage: "waveform"),
            .init(capability: .camera, title: "相机", subtitle: "从相机拍摄照片和视频", systemImage: "camera"),
            .init(capability: .location, title: "定位", subtitle: "在代理请求时共享位置", systemImage: "location"),
        ]
    case "ja":
        return [
            .init(capability: .appleScript, title: "オートメーション (AppleScript)", subtitle: "自動化アクションのために他のアプリ（例: Terminal）を操作します", systemImage: "applescript"),
            .init(capability: .notifications, title: "通知", subtitle: "エージェントの動作をデスクトップ通知で知らせます", systemImage: "bell"),
            .init(capability: .accessibility, title: "アクセシビリティ", subtitle: "操作が必要なときに UI 要素を制御します", systemImage: "hand.raised"),
            .init(capability: .screenRecording, title: "画面収録", subtitle: "コンテキストやスクリーンショットのために画面を取得します", systemImage: "display"),
            .init(capability: .microphone, title: "マイク", subtitle: "Voice Wake と音声取得を許可します", systemImage: "mic"),
            .init(capability: .speechRecognition, title: "音声認識", subtitle: "Voice Wake のトリガーフレーズをデバイス上で文字起こしします", systemImage: "waveform"),
            .init(capability: .camera, title: "カメラ", subtitle: "カメラから写真や動画を取得します", systemImage: "camera"),
            .init(capability: .location, title: "位置情報", subtitle: "エージェントに要求されたときに位置情報を共有します", systemImage: "location"),
        ]
    case "ko":
        return [
            .init(capability: .appleScript, title: "자동화 (AppleScript)", subtitle: "자동화 작업을 위해 다른 앱(예: Terminal)을 제어합니다", systemImage: "applescript"),
            .init(capability: .notifications, title: "알림", subtitle: "에이전트 활동에 대한 데스크톱 알림을 표시합니다", systemImage: "bell"),
            .init(capability: .accessibility, title: "손쉬운 사용", subtitle: "작업에 필요할 때 UI 요소를 제어합니다", systemImage: "hand.raised"),
            .init(capability: .screenRecording, title: "화면 기록", subtitle: "컨텍스트나 스크린샷을 위해 화면을 캡처합니다", systemImage: "display"),
            .init(capability: .microphone, title: "마이크", subtitle: "Voice Wake와 오디오 캡처를 허용합니다", systemImage: "mic"),
            .init(capability: .speechRecognition, title: "음성 인식", subtitle: "Voice Wake 트리거 문구를 기기에서 인식합니다", systemImage: "waveform"),
            .init(capability: .camera, title: "카메라", subtitle: "카메라에서 사진과 영상을 캡처합니다", systemImage: "camera"),
            .init(capability: .location, title: "위치", subtitle: "에이전트가 요청할 때 위치를 공유합니다", systemImage: "location"),
        ]
    case "es":
        return [
            .init(capability: .appleScript, title: "Automatización (AppleScript)", subtitle: "Controla otras apps (por ejemplo, Terminal) para acciones de automatización", systemImage: "applescript"),
            .init(capability: .notifications, title: "Notificaciones", subtitle: "Muestra alertas de escritorio para la actividad del agente", systemImage: "bell"),
            .init(capability: .accessibility, title: "Accesibilidad", subtitle: "Controla elementos de la interfaz cuando una acción lo necesita", systemImage: "hand.raised"),
            .init(capability: .screenRecording, title: "Grabación de pantalla", subtitle: "Captura la pantalla para contexto o capturas", systemImage: "display"),
            .init(capability: .microphone, title: "Micrófono", subtitle: "Permite Voice Wake y la captura de audio", systemImage: "mic"),
            .init(capability: .speechRecognition, title: "Reconocimiento de voz", subtitle: "Transcribe en el dispositivo las frases de activación de Voice Wake", systemImage: "waveform"),
            .init(capability: .camera, title: "Cámara", subtitle: "Captura fotos y video desde la cámara", systemImage: "camera"),
            .init(capability: .location, title: "Ubicación", subtitle: "Comparte la ubicación cuando el agente la solicite", systemImage: "location"),
        ]
    default:
        return [
            .init(capability: .appleScript, title: "Automation (AppleScript)", subtitle: "Control other apps (e.g. Terminal) for automation actions", systemImage: "applescript"),
            .init(capability: .notifications, title: "Notifications", subtitle: "Show desktop alerts for agent activity", systemImage: "bell"),
            .init(capability: .accessibility, title: "Accessibility", subtitle: "Control UI elements when an action requires it", systemImage: "hand.raised"),
            .init(capability: .screenRecording, title: "Screen Recording", subtitle: "Capture the screen for context or screenshots", systemImage: "display"),
            .init(capability: .microphone, title: "Microphone", subtitle: "Allow Voice Wake and audio capture", systemImage: "mic"),
            .init(capability: .speechRecognition, title: "Speech Recognition", subtitle: "Transcribe Voice Wake trigger phrases on-device", systemImage: "waveform"),
            .init(capability: .camera, title: "Camera", subtitle: "Capture photos and video from the camera", systemImage: "camera"),
            .init(capability: .location, title: "Location", subtitle: "Share location when requested by the agent", systemImage: "location"),
        ]
    }
}

enum NativePermissionManager {
    @MainActor
    private static var notificationRuntimeAvailableProvider: @MainActor @Sendable () -> Bool = {
        let bundle = Bundle.main
        return bundle.bundleURL.pathExtension == "app"
            && !(bundle.bundleIdentifier?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }

    @MainActor
    private static var notificationAuthorizationStatusProvider: @MainActor @Sendable () async -> UNAuthorizationStatus = {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        return settings.authorizationStatus
    }

    @MainActor
    static func overrideNotificationRuntimeAvailableProviderForTesting(
        _ provider: @escaping @MainActor @Sendable () -> Bool
    ) {
        notificationRuntimeAvailableProvider = provider
    }

    @MainActor
    static func resetNotificationRuntimeAvailableProviderForTesting() {
        notificationRuntimeAvailableProvider = {
            let bundle = Bundle.main
            return bundle.bundleURL.pathExtension == "app"
                && !(bundle.bundleIdentifier?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        }
    }

    @MainActor
    static func overrideNotificationAuthorizationStatusProviderForTesting(
        _ provider: @escaping @MainActor @Sendable () async -> UNAuthorizationStatus
    ) {
        notificationAuthorizationStatusProvider = provider
    }

    @MainActor
    static func resetNotificationAuthorizationStatusProviderForTesting() {
        notificationAuthorizationStatusProvider = {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            return settings.authorizationStatus
        }
    }

    @MainActor
    private static func notificationRuntimeAvailable() -> Bool {
        notificationRuntimeAvailableProvider()
    }

    @MainActor
    private static func notificationAuthorizationStatus() async -> UNAuthorizationStatus {
        guard notificationRuntimeAvailable() else { return .notDetermined }
        return await notificationAuthorizationStatusProvider()
    }

    @MainActor
    private static func requestNotificationAuthorization() async -> Bool {
        guard notificationRuntimeAvailable() else { return false }
        let center = UNUserNotificationCenter.current()
        return await (try? center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    static func status(_ capabilities: [NativePermissionCapability] = NativePermissionCapability.allCases) async -> [NativePermissionCapability: Bool] {
        var results: [NativePermissionCapability: Bool] = [:]

        for capability in capabilities {
            switch capability {
            case .notifications:
                let authorizationStatus = await self.notificationAuthorizationStatus()
                results[capability] = authorizationStatus == .authorized || authorizationStatus == .provisional
            case .appleScript:
                results[capability] = await MainActor.run { NativeAppleScriptPermission.isAuthorized() }
            case .accessibility:
                results[capability] = await MainActor.run { AXIsProcessTrusted() }
            case .screenRecording:
                results[capability] = NativeScreenRecordingProbe.isAuthorized()
            case .microphone:
                results[capability] = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
            case .speechRecognition:
                results[capability] = SFSpeechRecognizer.authorizationStatus() == .authorized
            case .camera:
                results[capability] = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
            case .location:
                let status = CLLocationManager().authorizationStatus
                results[capability] = CLLocationManager.locationServicesEnabled()
                    && self.isLocationAuthorized(status: status, requireAlways: false)
            }
        }

        return results
    }

    static func ensure(_ capabilities: [NativePermissionCapability], interactive: Bool) async -> [NativePermissionCapability: Bool] {
        var results: [NativePermissionCapability: Bool] = [:]
        for capability in capabilities {
            results[capability] = await ensureCapability(capability, interactive: interactive)
        }
        return results
    }

    static func isLocationAuthorized(status: CLAuthorizationStatus, requireAlways: Bool) -> Bool {
        if requireAlways { return status == .authorizedAlways }

        switch status {
        case .authorizedAlways, .authorizedWhenInUse, .authorized:
            return true
        default:
            return false
        }
    }

    private static func ensureCapability(_ capability: NativePermissionCapability, interactive: Bool) async -> Bool {
        switch capability {
        case .notifications:
            await ensureNotifications(interactive: interactive)
        case .appleScript:
            await ensureAppleScript(interactive: interactive)
        case .accessibility:
            await ensureAccessibility(interactive: interactive)
        case .screenRecording:
            await ensureScreenRecording(interactive: interactive)
        case .microphone:
            await ensureMicrophone(interactive: interactive)
        case .speechRecognition:
            await ensureSpeechRecognition(interactive: interactive)
        case .camera:
            await ensureCamera(interactive: interactive)
        case .location:
            await ensureLocation(interactive: interactive)
        }
    }

    private static func ensureNotifications(interactive: Bool) async -> Bool {
        let authorizationStatus = await self.notificationAuthorizationStatus()

        switch authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return true
        case .notDetermined:
            guard interactive else { return false }
            let granted = await self.requestNotificationAuthorization()
            let updated = await self.notificationAuthorizationStatus()
            return granted && (updated == .authorized || updated == .provisional)
        case .denied:
            if interactive {
                NativeNotificationPermissionHelper.openSettings()
            }
            return false
        @unknown default:
            return false
        }
    }

    private static func ensureAppleScript(interactive: Bool) async -> Bool {
        let granted = await MainActor.run { NativeAppleScriptPermission.isAuthorized() }
        if interactive, !granted {
            await NativeAppleScriptPermission.requestAuthorization()
        }
        return await MainActor.run { NativeAppleScriptPermission.isAuthorized() }
    }

    private static func ensureAccessibility(interactive: Bool) async -> Bool {
        let trusted = await MainActor.run { AXIsProcessTrusted() }
        if interactive, !trusted {
            await MainActor.run {
                let options: NSDictionary = ["AXTrustedCheckOptionPrompt": true]
                _ = AXIsProcessTrustedWithOptions(options)
            }
        }
        return await MainActor.run { AXIsProcessTrusted() }
    }

    private static func ensureScreenRecording(interactive: Bool) async -> Bool {
        let granted = NativeScreenRecordingProbe.isAuthorized()
        if interactive, !granted {
            await NativeScreenRecordingProbe.requestAuthorization()
        }
        return NativeScreenRecordingProbe.isAuthorized()
    }

    private static func ensureMicrophone(interactive: Bool) async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            return true
        case .notDetermined:
            guard interactive else { return false }
            return await AVCaptureDevice.requestAccess(for: .audio)
        case .denied, .restricted:
            if interactive {
                NativeMicrophonePermissionHelper.openSettings()
            }
            return false
        @unknown default:
            return false
        }
    }

    private static func ensureSpeechRecognition(interactive: Bool) async -> Bool {
        let status = SFSpeechRecognizer.authorizationStatus()
        if status == .notDetermined, interactive {
            await withUnsafeContinuation { (continuation: UnsafeContinuation<Void, Never>) in
                SFSpeechRecognizer.requestAuthorization { _ in
                    DispatchQueue.main.async {
                        continuation.resume()
                    }
                }
            }
        }

        return SFSpeechRecognizer.authorizationStatus() == .authorized
    }

    private static func ensureCamera(interactive: Bool) async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            return true
        case .notDetermined:
            guard interactive else { return false }
            return await AVCaptureDevice.requestAccess(for: .video)
        case .denied, .restricted:
            if interactive {
                NativeCameraPermissionHelper.openSettings()
            }
            return false
        @unknown default:
            return false
        }
    }

    private static func ensureLocation(interactive: Bool) async -> Bool {
        guard CLLocationManager.locationServicesEnabled() else {
            if interactive {
                await MainActor.run { NativeLocationPermissionHelper.openSettings() }
            }
            return false
        }

        let status = CLLocationManager().authorizationStatus
        switch status {
        case .authorizedAlways, .authorizedWhenInUse, .authorized:
            return true
        case .notDetermined:
            guard interactive else { return false }
            let updated = await NativeLocationPermissionRequester.shared.request(always: false)
            return self.isLocationAuthorized(status: updated, requireAlways: false)
        case .denied, .restricted:
            if interactive {
                await MainActor.run { NativeLocationPermissionHelper.openSettings() }
            }
            return false
        @unknown default:
            return false
        }
    }
}

@MainActor
@Observable
final class NativePermissionMonitor {
    static let shared = NativePermissionMonitor()

    private(set) var status: [NativePermissionCapability: Bool] = [:]

    private var monitorTimer: Timer?
    private var isChecking = false
    private var registrations = 0
    private var lastCheck: Date?
    private let minimumCheckInterval: TimeInterval = 0.5

    func register() {
        registrations += 1
        if registrations == 1 {
            startMonitoring()
        }
    }

    func unregister() {
        guard registrations > 0 else { return }
        registrations -= 1
        if registrations == 0 {
            stopMonitoring()
        }
    }

    func refreshNow() async {
        await checkStatus(force: true)
    }

    private func startMonitoring() {
        Task { await checkStatus(force: true) }

        monitorTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                await self.checkStatus(force: false)
            }
        }
    }

    private func stopMonitoring() {
        monitorTimer?.invalidate()
        monitorTimer = nil
        lastCheck = nil
    }

    private func checkStatus(force: Bool) async {
        if isChecking { return }
        let now = Date()
        if !force, let lastCheck, now.timeIntervalSince(lastCheck) < minimumCheckInterval {
            return
        }

        isChecking = true
        let latest = await NativePermissionManager.status()
        if latest != status {
            status = latest
        }
        lastCheck = Date()
        isChecking = false
    }
}

private enum NativeSystemSettingsURLSupport {
    static func openFirst(_ candidates: [String]) {
        for candidate in candidates {
            if let url = URL(string: candidate), NSWorkspace.shared.open(url) {
                return
            }
        }
    }
}

private enum NativeNotificationPermissionHelper {
    static func openSettings() {
        NativeSystemSettingsURLSupport.openFirst([
            "x-apple.systempreferences:com.apple.Notifications-Settings.extension",
            "x-apple.systempreferences:com.apple.preference.notifications",
        ])
    }
}

private enum NativeMicrophonePermissionHelper {
    static func openSettings() {
        NativeSystemSettingsURLSupport.openFirst([
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
            "x-apple.systempreferences:com.apple.preference.security",
        ])
    }
}

private enum NativeCameraPermissionHelper {
    static func openSettings() {
        NativeSystemSettingsURLSupport.openFirst([
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
            "x-apple.systempreferences:com.apple.preference.security",
        ])
    }
}

private enum NativeLocationPermissionHelper {
    static func openSettings() {
        NativeSystemSettingsURLSupport.openFirst([
            "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices",
            "x-apple.systempreferences:com.apple.preference.security",
        ])
    }
}

private enum NativeAppleScriptPermission {
    @MainActor
    static func isAuthorized() -> Bool {
        let script = """
        tell application "Terminal"
            return "chillclaw-ok"
        end tell
        """

        var error: NSDictionary?
        let appleScript = NSAppleScript(source: script)
        let result = appleScript?.executeAndReturnError(&error)

        if let error, let code = error["NSAppleScriptErrorNumber"] as? Int, code == -1743 {
            return false
        }

        return result != nil
    }

    @MainActor
    static func requestAuthorization() async {
        _ = self.isAuthorized()
        NativeSystemSettingsURLSupport.openFirst([
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
            "x-apple.systempreferences:com.apple.preference.security",
        ])
    }
}

@MainActor
private final class NativeLocationPermissionRequester: NSObject, CLLocationManagerDelegate {
    static let shared = NativeLocationPermissionRequester()

    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLAuthorizationStatus, Never>?
    private var timeoutTask: Task<Void, Never>?

    override init() {
        super.init()
        manager.delegate = self
    }

    func request(always: Bool) async -> CLAuthorizationStatus {
        let current = manager.authorizationStatus
        if NativePermissionManager.isLocationAuthorized(status: current, requireAlways: always) {
            return current
        }

        return await withCheckedContinuation { continuation in
            self.continuation = continuation
            timeoutTask?.cancel()
            timeoutTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                await MainActor.run {
                    guard let self, self.continuation != nil else { return }
                    NativeLocationPermissionHelper.openSettings()
                    self.finish(status: self.manager.authorizationStatus)
                }
            }

            if always {
                manager.requestAlwaysAuthorization()
            } else {
                manager.requestWhenInUseAuthorization()
            }

            manager.requestLocation()
        }
    }

    private func finish(status: CLAuthorizationStatus) {
        timeoutTask?.cancel()
        timeoutTask = nil
        guard let continuation else { return }
        self.continuation = nil
        continuation.resume(returning: status)
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.finish(status: status)
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didChangeAuthorization status: CLAuthorizationStatus
    ) {
        Task { @MainActor in
            self.finish(status: status)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            if status == .denied || status == .restricted {
                NativeLocationPermissionHelper.openSettings()
            }
            self.finish(status: status)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.finish(status: status)
        }
    }
}

private enum NativeScreenRecordingProbe {
    static func isAuthorized() -> Bool {
        if #available(macOS 10.15, *) {
            return CGPreflightScreenCaptureAccess()
        }
        return true
    }

    @MainActor
    static func requestAuthorization() async {
        if #available(macOS 10.15, *) {
            _ = CGRequestScreenCaptureAccess()
        }
    }
}
