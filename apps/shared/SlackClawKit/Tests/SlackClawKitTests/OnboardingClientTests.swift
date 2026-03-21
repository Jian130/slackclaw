import Foundation
import Testing
@testable import SlackClawClient
@testable import SlackClawProtocol

@Suite(.serialized)
struct OnboardingClientTests {
    @Test
    func fetchOnboardingStateUsesFreshEndpoint() async throws {
        let recorder = RequestRecorder()
        let session = await recorder.session(
            statusCode: 200,
            body: """
            {
              "firstRun": {
                "introCompleted": false,
                "setupCompleted": false
              },
              "draft": {
                "currentStep": "welcome"
              },
              "summary": {}
            }
            """
        )
        let client = SlackClawAPIClient(
            session: session,
            configurationProvider: {
                .init(
                    daemonURL: URL(string: "http://127.0.0.1:4545")!,
                    fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
                )
            }
        )

        let response = try await client.fetchOnboardingState()

        #expect(response.draft.currentStep == .welcome)
        let request = try #require(await recorder.lastRequest())
        #expect(request.httpMethod == "GET")
        #expect(request.url?.absoluteString == "http://127.0.0.1:4545/api/onboarding/state?fresh=1")
    }

    @Test
    func updateOnboardingStateUsesPatchBody() async throws {
        let recorder = RequestRecorder()
        let session = await recorder.session(
            statusCode: 200,
            body: """
            {
              "firstRun": {
                "introCompleted": true,
                "setupCompleted": false
              },
              "draft": {
                "currentStep": "model",
                "model": {
                  "providerId": "anthropic",
                  "modelKey": "anthropic/claude-opus-4-6"
                }
              },
              "summary": {}
            }
            """
        )
        let client = SlackClawAPIClient(
            session: session,
            configurationProvider: {
                .init(
                    daemonURL: URL(string: "http://127.0.0.1:4545")!,
                    fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
                )
            }
        )

        let response = try await client.updateOnboardingState(
            .init(currentStep: .model, model: .init(providerId: "anthropic", modelKey: "anthropic/claude-opus-4-6"))
        )

        #expect(response.draft.currentStep == .model)
        let request = try #require(await recorder.lastRequest())
        #expect(request.httpMethod == "PATCH")
        #expect(request.url?.absoluteString == "http://127.0.0.1:4545/api/onboarding/state")
        let body = try #require(readRequestBody(request))
        let payload = try JSONDecoder.slackClaw.decode(UpdateOnboardingStateRequest.self, from: body)
        #expect(payload.currentStep == .model)
        #expect(payload.model?.providerId == "anthropic")
    }

    @Test
    func completeOnboardingPostsDestination() async throws {
        let recorder = RequestRecorder()
        let session = await recorder.session(
            statusCode: 200,
            body: """
            {
              "status": "completed",
              "destination": "chat",
              "summary": {},
              "overview": {
                "appName": "SlackClaw",
                "appVersion": "0.1.2",
                "platformTarget": "macOS first",
                "firstRun": {
                  "introCompleted": true,
                  "setupCompleted": true
                },
                "appService": {
                  "mode": "launchagent",
                  "installed": true,
                  "running": true,
                  "managedAtLogin": true,
                  "summary": "Running",
                  "detail": "Loaded"
                },
                "engine": {
                  "engine": "openclaw",
                  "installed": true,
                  "running": true,
                  "version": "2026.3.13",
                  "summary": "Ready",
                  "lastCheckedAt": "2026-03-20T00:00:00.000Z"
                },
                "installSpec": {
                  "engine": "openclaw",
                  "desiredVersion": "latest",
                  "installSource": "npm-local",
                  "prerequisites": ["macOS"]
                },
                "capabilities": {
                  "engine": "openclaw",
                  "supportsInstall": true,
                  "supportsUpdate": true,
                  "supportsRecovery": true,
                  "supportsStreaming": true,
                  "runtimeModes": ["gateway"],
                  "supportedChannels": ["telegram"],
                  "starterSkillCategories": ["communication"],
                  "futureLocalModelFamilies": ["qwen"]
                },
                "installChecks": [],
                "channelSetup": {
                  "baseOnboardingCompleted": true,
                  "channels": [],
                  "gatewayStarted": true,
                  "gatewaySummary": "Running"
                },
                "profiles": [],
                "templates": [],
                "healthChecks": [],
                "recoveryActions": [],
                "recentTasks": []
              }
            }
            """
        )
        let client = SlackClawAPIClient(
            session: session,
            configurationProvider: {
                .init(
                    daemonURL: URL(string: "http://127.0.0.1:4545")!,
                    fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
                )
            }
        )

        let response = try await client.completeOnboarding(.init(destination: .chat))

        #expect(response.destination == .chat)
        let request = try #require(await recorder.lastRequest())
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "http://127.0.0.1:4545/api/onboarding/complete")
        let body = try #require(readRequestBody(request))
        let payload = try JSONDecoder.slackClaw.decode(CompleteOnboardingRequest.self, from: body)
        #expect(payload.destination == .chat)
    }

    @Test
    func runFirstRunSetupUsesExtendedTimeout() async throws {
        let recorder = RequestRecorder()
        let session = await recorder.session(
            statusCode: 200,
            body: """
            {
              "status": "completed",
              "message": "OpenClaw deployment is complete.",
              "steps": [],
              "overview": {
                "appName": "SlackClaw",
                "appVersion": "0.1.2",
                "platformTarget": "macOS first",
                "firstRun": {
                  "introCompleted": true,
                  "setupCompleted": false
                },
                "appService": {
                  "mode": "launchagent",
                  "installed": true,
                  "running": true,
                  "managedAtLogin": true,
                  "summary": "Running",
                  "detail": "Loaded"
                },
                "engine": {
                  "engine": "openclaw",
                  "installed": true,
                  "running": true,
                  "version": "2026.3.13",
                  "summary": "Ready",
                  "lastCheckedAt": "2026-03-20T00:00:00.000Z"
                },
                "installSpec": {
                  "engine": "openclaw",
                  "desiredVersion": "latest",
                  "installSource": "npm-local",
                  "prerequisites": ["macOS"]
                },
                "capabilities": {
                  "engine": "openclaw",
                  "supportsInstall": true,
                  "supportsUpdate": true,
                  "supportsRecovery": true,
                  "supportsStreaming": true,
                  "runtimeModes": ["gateway"],
                  "supportedChannels": ["telegram"],
                  "starterSkillCategories": ["communication"],
                  "futureLocalModelFamilies": ["qwen"]
                },
                "installChecks": [],
                "channelSetup": {
                  "baseOnboardingCompleted": true,
                  "channels": [],
                  "gatewayStarted": false,
                  "gatewaySummary": "Stopped"
                },
                "profiles": [],
                "templates": [],
                "healthChecks": [],
                "recoveryActions": [],
                "recentTasks": []
              },
              "install": {
                "status": "installed",
                "message": "Installed OpenClaw.",
                "engineStatus": {
                  "engine": "openclaw",
                  "installed": true,
                  "running": true,
                  "version": "2026.3.13",
                  "summary": "Ready",
                  "lastCheckedAt": "2026-03-20T00:00:00.000Z"
                }
              }
            }
            """
        )
        let client = SlackClawAPIClient(
            session: session,
            configurationProvider: {
                .init(
                    daemonURL: URL(string: "http://127.0.0.1:4545")!,
                    fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
                )
            }
        )

        _ = try await client.runFirstRunSetup()

        let request = try #require(await recorder.lastRequest())
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "http://127.0.0.1:4545/api/first-run/setup")
        #expect(request.timeoutInterval == 300)
    }
}

private func readRequestBody(_ request: URLRequest) -> Data? {
    if let body = request.httpBody {
        return body
    }

    guard let stream = request.httpBodyStream else {
        return nil
    }

    stream.open()
    defer { stream.close() }

    var data = Data()
    let bufferSize = 4096
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
    defer { buffer.deallocate() }

    while stream.hasBytesAvailable {
        let read = stream.read(buffer, maxLength: bufferSize)
        if read <= 0 {
            break
        }
        data.append(buffer, count: read)
    }

    return data.isEmpty ? nil : data
}

private actor RequestRecorder {
    private var request: URLRequest?

    func session(statusCode: Int, body: String) async -> URLSession {
        await MainActor.run {
            RecordingURLProtocol.handler = { request in
                await self.record(request)
                guard let url = request.url else {
                    throw SlackClawClientError.invalidResponse
                }
                let response = HTTPURLResponse(
                    url: url,
                    statusCode: statusCode,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )!
                return (response, Data(body.utf8))
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RecordingURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    func record(_ request: URLRequest) {
        self.request = request
    }

    func lastRequest() -> URLRequest? {
        request
    }
}

private final class RecordingURLProtocol: URLProtocol, @unchecked Sendable {
    @MainActor static var handler: (@Sendable (URLRequest) async throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Task {
            guard let client else { return }
            let handler = await MainActor.run { Self.handler }
            guard let handler else {
                client.urlProtocol(self, didFailWithError: SlackClawClientError.invalidResponse)
                return
            }

            do {
                let (response, data) = try await handler(request)
                client.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                client.urlProtocol(self, didLoad: data)
                client.urlProtocolDidFinishLoading(self)
            } catch {
                client.urlProtocol(self, didFailWithError: error)
            }
        }
    }

    override func stopLoading() {}
}
