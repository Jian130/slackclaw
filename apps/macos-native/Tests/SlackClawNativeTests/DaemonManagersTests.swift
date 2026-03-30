import Foundation
import Testing
@testable import SlackClawNative
@testable import SlackClawClient

@MainActor
struct DaemonManagersTests {
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
