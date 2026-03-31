import Foundation
import ChillClawProtocol

public final class ChillClawEventStreamClient: @unchecked Sendable {
    public typealias RawEventStreamFactory = @Sendable (_ url: URL) async throws -> AsyncThrowingStream<Data, Error>
    public typealias SleepHandler = @Sendable (_ delayNanos: UInt64) async -> Void

    private let configurationProvider: @Sendable () async -> ChillClawClientConfiguration
    private let rawEventStreamFactory: RawEventStreamFactory
    private let reconnectBackoffNanos: [UInt64]
    private let sleepHandler: SleepHandler

    public init(
        session: URLSession = .shared,
        configurationProvider: @escaping @Sendable () async -> ChillClawClientConfiguration,
        rawEventStreamFactory: RawEventStreamFactory? = nil,
        reconnectBackoffNanos: [UInt64] = [
            250_000_000,
            500_000_000,
            1_000_000_000,
        ],
        sleepHandler: SleepHandler? = nil
    ) {
        self.configurationProvider = configurationProvider
        self.reconnectBackoffNanos = reconnectBackoffNanos
        self.rawEventStreamFactory = rawEventStreamFactory ?? Self.makeDefaultRawEventStreamFactory(session: session)
        self.sleepHandler = sleepHandler ?? { delayNanos in
            try? await Task.sleep(nanoseconds: delayNanos)
        }
    }

    public func daemonEvents() -> AsyncStream<ChillClawEvent> {
        AsyncStream { continuation in
            let task = Task {
                var reconnectAttempt = 0

                while !Task.isCancelled {
                    let configuration = await configurationProvider()
                    let url = configuration.daemonURL.appending(path: "/api/events")

                    do {
                        let rawStream = try await rawEventStreamFactory(url)
                        for try await payload in rawStream {
                            if Task.isCancelled {
                                break
                            }

                            if let event = try? JSONDecoder.chillClaw.decode(ChillClawEvent.self, from: payload) {
                                continuation.yield(event)
                            }
                        }
                    } catch {
                        // Reconnect below using the same backoff path as a closed stream.
                    }

                    if Task.isCancelled {
                        break
                    }

                    let delay = reconnectBackoffNanos[min(reconnectAttempt, reconnectBackoffNanos.count - 1)]
                    reconnectAttempt = min(reconnectAttempt + 1, reconnectBackoffNanos.count - 1)
                    await sleepHandler(delay)
                }

                continuation.finish()
            }

            continuation.onTermination = { @Sendable _ in
                task.cancel()
            }
        }
    }

    static func normalizeDaemonEventSocketURL(_ url: URL) -> URL {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url
        }

        switch components.scheme?.lowercased() {
        case "http":
            components.scheme = "ws"
        case "https":
            components.scheme = "wss"
        default:
            break
        }

        return components.url ?? url
    }

    private static func makeDefaultRawEventStreamFactory(session: URLSession) -> RawEventStreamFactory {
        { url in
            AsyncThrowingStream { continuation in
                let task = session.webSocketTask(with: normalizeDaemonEventSocketURL(url))
                task.resume()

                let receiver = Task {
                    do {
                        while !Task.isCancelled {
                            let message = try await task.receive()
                            switch message {
                            case let .data(data):
                                continuation.yield(data)
                            case let .string(text):
                                if let data = text.data(using: .utf8) {
                                    continuation.yield(data)
                                }
                            @unknown default:
                                break
                            }
                        }
                        continuation.finish()
                    } catch {
                        if Task.isCancelled {
                            continuation.finish()
                        } else {
                            continuation.finish(throwing: error)
                        }
                    }
                }

                continuation.onTermination = { @Sendable _ in
                    receiver.cancel()
                    task.cancel(with: .goingAway, reason: nil)
                }
            }
        }
    }
}
