import Foundation
import Testing
@testable import ChillClawNative
@testable import ChillClawClient

@MainActor
struct DaemonManagersTests {
    @Test
    func daemonSupportCreatesApplicationSupportDataAndLogDirectories() throws {
        let home = FileManager.default.temporaryDirectory
            .appendingPathComponent("chillclaw-native-support-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: home) }

        let paths = try NativeDaemonSupport.ensureDirectories(homeDirectory: home.path)

        #expect(FileManager.default.fileExists(atPath: paths.appSupport))
        #expect(FileManager.default.fileExists(atPath: paths.dataDir))
        #expect(FileManager.default.fileExists(atPath: paths.logDir))
        #expect(paths.appSupport.hasSuffix("Library/Application Support/ChillClaw"))
    }

    @Test
    func endpointStorePublishesReadyWhenPingSucceeds() async throws {
        let store = DaemonEndpointStore(
            configuration: .init(
                daemonURL: URL(string: "http://127.0.0.1:4545")!,
                fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
            ),
            ping: { true }
        )

        await store.refresh()

        guard case let .ready(url) = await store.state else {
            Issue.record("Expected ready state")
            return
        }
        #expect(url.absoluteString == "http://127.0.0.1:4545")
    }

    @Test
    func processManagerStartsLaunchAgentWhenDaemonMissing() async throws {
        let launchAgent = FakeLaunchAgentController()
        let manager = DaemonProcessManager(
            launchAgent: launchAgent,
            ping: {
                await launchAgent.currentStartAttempts() > 0
            }
        )

        await manager.ensureRunning()

        #expect(await launchAgent.currentStartAttempts() == 1)
        #expect(manager.status == .running(details: "Daemon reachable"))
    }

    @Test
    func processManagerPreparesSupportDirectoriesBeforeInitialPing() async throws {
        let launchAgent = FakeLaunchAgentController()
        let recorder = StartupEventRecorder()
        let manager = DaemonProcessManager(
            launchAgent: launchAgent,
            ping: {
                await recorder.record("ping")
                return await launchAgent.currentStartAttempts() > 0
            },
            prepareStartup: {
                await recorder.record("prepare")
            }
        )

        await manager.ensureRunning()

        let events = await recorder.recordedEvents()
        #expect(events.prefix(2) == ["prepare", "ping"])
        #expect(await launchAgent.currentStartAttempts() == 1)
        #expect(manager.status == .running(details: "Daemon reachable"))
    }
}

private actor FakeLaunchAgentController: LaunchAgentControlling {
    private var startAttempts = 0

    func installAndStart() async throws {
        startAttempts += 1
    }

    func stopAndRemove() async throws {}

    func restart() async throws {}

    func status() async -> LaunchAgentStatus {
        .init(installed: startAttempts > 0, running: startAttempts > 0, detail: "fake")
    }

    func currentStartAttempts() -> Int {
        startAttempts
    }
}

private actor StartupEventRecorder {
    private var events: [String] = []

    func record(_ event: String) {
        events.append(event)
    }

    func recordedEvents() -> [String] {
        events
    }
}
