import Foundation
import Testing
@testable import SlackClawProtocol
@testable import SlackClawClient

struct SlackClawProtocolTests {
    @Test
    func onboardingStateResponseDecodesDraftAndSummary() throws {
        let data = """
        {
          "firstRun": {
            "introCompleted": true,
            "setupCompleted": false,
            "selectedProfileId": "default"
          },
          "draft": {
            "currentStep": "channel",
            "install": {
              "installed": true,
              "version": "2026.3.13",
              "disposition": "reused-existing"
            },
            "model": {
              "providerId": "anthropic",
              "modelKey": "anthropic/claude-opus-4-6",
              "methodId": "oauth",
              "entryId": "entry-1"
            },
            "activeModelAuthSessionId": "session-1"
          },
          "summary": {
            "install": {
              "installed": true,
              "version": "2026.3.13"
            },
            "model": {
              "providerId": "anthropic",
              "modelKey": "anthropic/claude-opus-4-6",
              "entryId": "entry-1"
            }
          }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder.slackClaw.decode(OnboardingStateResponse.self, from: data)
        #expect(response.firstRun.setupCompleted == false)
        #expect(response.draft.currentStep == .channel)
        #expect(response.draft.install?.disposition == "reused-existing")
        #expect(response.draft.activeModelAuthSessionId == "session-1")
        #expect(response.summary.model?.entryId == "entry-1")
    }

    @Test
    func productOverviewDecodesPendingGatewayApply() throws {
        let data = """
        {
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
            "pendingGatewayApply": true,
            "pendingGatewayApplySummary": "Restart required",
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
        """.data(using: .utf8)!

        let overview = try JSONDecoder.slackClaw.decode(ProductOverview.self, from: data)
        #expect(overview.engine.pendingGatewayApply == true)
        #expect(overview.installSpec.desiredVersion == "latest")
        #expect(overview.appService.mode == .launchagent)
    }

    @Test
    func chatStreamEventDecodesAssistantCompletedPayload() throws {
        let data = """
        {
          "type": "assistant-completed",
          "threadId": "thread-1",
          "detail": {
            "id": "thread-1",
            "memberId": "member-1",
            "agentId": "agent-1",
            "sessionKey": "agent:main:test",
            "title": "Hello",
            "createdAt": "2026-03-20T00:00:00.000Z",
            "updatedAt": "2026-03-20T00:00:01.000Z",
            "unreadCount": 0,
            "historyStatus": "ready",
            "composerState": {
              "status": "idle",
              "canSend": true,
              "canAbort": false
            },
            "messages": [
              {
                "id": "m1",
                "role": "assistant",
                "text": "hello"
              }
            ]
          }
        }
        """.data(using: .utf8)!

        let event = try JSONDecoder.slackClaw.decode(ChatStreamEvent.self, from: data)
        guard case let .assistantCompleted(threadId, detail, _) = event else {
            Issue.record("Expected assistantCompleted event")
            return
        }
        #expect(threadId == "thread-1")
        #expect(detail.messages.count == 1)
        #expect(detail.messages.first?.text == "hello")
    }

    @Test
    func sseParserCombinesFrames() {
        let parser = SSEParser()
        let chunks = [
            "data: {\"type\":\"connected\"}\n",
            "\n",
            ": keep-alive\n\n",
            "data: {\"type\":\"thread-updated\",",
            "\"thread\":{\"id\":\"thread-1\"}}\n\n",
        ]

        var events: [String] = []
        for chunk in chunks {
            events.append(contentsOf: parser.feed(chunk))
        }

        #expect(events.count == 2)
        #expect(events[0] == "{\"type\":\"connected\"}")
        #expect(events[1] == "{\"type\":\"thread-updated\",\"thread\":{\"id\":\"thread-1\"}}")
    }

    @Test
    func setupRunResponseDecodesInstallPayload() throws {
        let data = """
        {
          "status": "completed",
          "message": "SlackClaw completed setup.",
          "steps": [
            {
              "id": "install",
              "title": "Install OpenClaw",
              "status": "completed",
              "detail": "Installed latest"
            }
          ],
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
              "gatewayStarted": true,
              "gatewaySummary": "Running"
            },
            "profiles": [],
            "templates": [],
            "healthChecks": [],
            "recoveryActions": [],
            "recentTasks": []
          },
          "install": {
            "status": "installed",
            "message": "Installed",
            "engineStatus": {
              "engine": "openclaw",
              "installed": true,
              "running": true,
              "version": "2026.3.13",
              "summary": "Ready",
              "lastCheckedAt": "2026-03-20T00:00:00.000Z"
            },
            "disposition": "installed",
            "actualVersion": "2026.3.13"
          }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder.slackClaw.decode(SetupRunResponse.self, from: data)
        #expect(response.status == "completed")
        #expect(response.install?.actualVersion == "2026.3.13")
        #expect(response.overview.engine.installed == true)
    }
}
