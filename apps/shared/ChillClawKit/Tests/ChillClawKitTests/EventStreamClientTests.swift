import Foundation
import Testing
@testable import ChillClawClient
@testable import ChillClawProtocol

@Suite(.serialized)
struct EventStreamClientTests {
    @Test
    func normalizesHttpDaemonUrlsForWebSocketConnections() {
        #expect(
            ChillClawEventStreamClient.normalizeDaemonEventSocketURL(
                URL(string: "http://127.0.0.1:4545/api/events")!
            ).absoluteString == "ws://127.0.0.1:4545/api/events"
        )
        #expect(
            ChillClawEventStreamClient.normalizeDaemonEventSocketURL(
                URL(string: "https://chillclaw.local/api/events")!
            ).absoluteString == "wss://chillclaw.local/api/events"
        )
    }

    @Test
    func daemonEventsDecodeGatewayStatusMessages() async {
        let client = ChillClawEventStreamClient(
            configurationProvider: {
                .init(
                    daemonURL: URL(string: "http://127.0.0.1:4545")!,
                    fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
                )
            },
            rawEventStreamFactory: { _ in
                AsyncThrowingStream { continuation in
                    continuation.yield(
                        """
                        {"type":"gateway.status","reachable":true,"pendingGatewayApply":false,"summary":"Ready"}
                        """.data(using: .utf8)!
                    )
                    continuation.finish()
                }
            },
            sleepHandler: { _ in }
        )

        let stream = client.daemonEvents()
        var iterator = stream.makeAsyncIterator()
        let first = await iterator.next()

        guard case let .gatewayStatus(reachable, pendingGatewayApply, summary)? = first else {
            Issue.record("Expected gateway.status event")
            return
        }

        #expect(reachable == true)
        #expect(pendingGatewayApply == false)
        #expect(summary == "Ready")
    }

    @Test
    func daemonEventsReconnectAfterFactoryFailureWithBackoff() async {
        let attempts = LockedValue(0)
        let observedSleeps = LockedValue<[UInt64]>([])
        let client = ChillClawEventStreamClient(
            configurationProvider: {
                .init(
                    daemonURL: URL(string: "http://127.0.0.1:4545")!,
                    fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
                )
            },
            rawEventStreamFactory: { _ in
                let attempt = await attempts.withLock { value in
                    value += 1
                    return value
                }

                if attempt == 1 {
                    throw TestEventStreamError.disconnected
                }

                return AsyncThrowingStream { continuation in
                    continuation.yield(
                        """
                        {"type":"task.progress","taskId":"task-1","status":"running","message":"Working"}
                        """.data(using: .utf8)!
                    )
                }
            },
            reconnectBackoffNanos: [123],
            sleepHandler: { delay in
                await observedSleeps.withLock { sleeps in
                    sleeps.append(delay)
                }
            }
        )

        let stream = client.daemonEvents()
        var iterator = stream.makeAsyncIterator()
        let first = await iterator.next()

        guard case let .taskProgress(taskId, status, message)? = first else {
            Issue.record("Expected task.progress event")
            return
        }

        let attemptCount = await attempts.withLock { $0 }
        let sleeps = await observedSleeps.withLock { $0 }

        #expect(taskId == "task-1")
        #expect(status == .running)
        #expect(message == "Working")
        #expect(attemptCount == 2)
        #expect(sleeps == [123])
    }
}

private enum TestEventStreamError: Error {
    case disconnected
}

private actor LockedValue<Value> {
    private var value: Value

    init(_ value: Value) {
        self.value = value
    }

    func withLock<T>(_ update: (inout Value) -> T) -> T {
        update(&value)
    }
}
