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
              "providerId": "openai",
              "modelKey": "openai/gpt-5.1-codex",
              "methodId": "openai-codex",
              "entryId": "entry-1"
            },
            "activeModelAuthSessionId": "session-1"
          },
          "config": {
            "modelProviders": [
              {
                "id": "minimax",
                "label": "MiniMax",
                "description": "MiniMax models for fast onboarding.",
                "theme": "minimax",
                "platformUrl": "https://platform.minimaxi.com/login",
                "tutorialVideoUrl": "https://video.example/minimax",
                "defaultModelKey": "minimax/MiniMax-M2.5",
                "authMethods": [
                  {
                    "id": "minimax-api-key",
                    "label": "API Key",
                    "kind": "api-key",
                    "description": "Paste a MiniMax API key.",
                    "interactive": false,
                    "fields": [
                      {
                        "id": "apiKey",
                        "label": "API Key",
                        "required": true,
                        "secret": true,
                        "placeholder": "Paste your API key here"
                      }
                    ]
                  }
                ]
              },
              {
                "id": "modelstudio",
                "label": "Qwen (通义千问)",
                "description": "Qwen models for fast onboarding.",
                "theme": "qwen",
                "platformUrl": "https://www.alibabacloud.com/help/en/model-studio/get-api-key",
                "defaultModelKey": "modelstudio/qwen3.5-plus",
                "authMethods": [
                  {
                    "id": "modelstudio-api-key-cn",
                    "label": "API Key",
                    "kind": "api-key",
                    "description": "Paste a Model Studio API key.",
                    "interactive": false,
                    "fields": [
                      {
                        "id": "apiKey",
                        "label": "API Key",
                        "required": true,
                        "secret": true,
                        "placeholder": "Paste your API key here"
                      }
                    ]
                  }
                ]
              },
              {
                "id": "openai",
                "label": "ChatGPT",
                "description": "OpenAI ChatGPT models for fast onboarding.",
                "theme": "chatgpt",
                "platformUrl": "https://platform.openai.com/api-keys",
                "defaultModelKey": "openai/gpt-5.1-codex",
                "authMethods": [
                  {
                    "id": "openai-api-key",
                    "label": "API Key",
                    "kind": "api-key",
                    "description": "Paste an OpenAI API key.",
                    "interactive": false,
                    "fields": [
                      {
                        "id": "apiKey",
                        "label": "API Key",
                        "required": true,
                        "secret": true,
                        "placeholder": "Paste your API key here"
                      }
                    ]
                  },
                  {
                    "id": "openai-codex",
                    "label": "OAuth",
                    "kind": "oauth",
                    "description": "Connect securely with your account.",
                    "interactive": true,
                    "fields": []
                  }
                ]
              }
            ],
            "channels": [
              {
                "id": "wechat",
                "label": "WeChat Work",
                "secondaryLabel": "企业微信",
                "description": "Set up WeChat Work credentials for your digital employees.",
                "theme": "wechat",
                "setupKind": "wechat-guided",
                "docsUrl": "https://work.weixin.qq.com/"
              },
              {
                "id": "feishu",
                "label": "Feishu",
                "secondaryLabel": "飞书",
                "description": "Configure Feishu app credentials for your digital employees.",
                "theme": "feishu",
                "setupKind": "feishu-guided",
                "platformUrl": "https://open.feishu.cn/app",
                "tutorialVideoUrl": "https://open.feishu.cn/"
              },
              {
                "id": "telegram",
                "label": "Telegram",
                "secondaryLabel": "Telegram",
                "description": "Connect a Telegram bot token for your digital employees.",
                "theme": "telegram",
                "setupKind": "telegram-guided",
                "docsUrl": "https://core.telegram.org/bots/tutorial"
              }
            ],
            "employeePresets": [
              {
                "id": "research-analyst",
                "label": "Research Analyst",
                "description": "Research quickly, write crisp summaries, and keep answers grounded in the right context.",
                "theme": "analyst",
                "starterSkillLabels": ["Research Brief", "Status Writer"],
                "toolLabels": ["Company handbook", "Delivery playbook"],
                "skillIds": ["research-brief", "status-writer"],
                "knowledgePackIds": ["company-handbook", "delivery-playbook"],
                "workStyles": [],
                "defaultMemoryEnabled": true
              }
            ]
          },
          "summary": {
            "install": {
              "installed": true,
              "version": "2026.3.13"
            },
            "model": {
              "providerId": "openai",
              "modelKey": "openai/gpt-5.1-codex",
              "entryId": "entry-1"
            }
          }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder.slackClaw.decode(OnboardingStateResponse.self, from: data)
        #expect(response.firstRun.setupCompleted == false)
        #expect(response.draft.currentStep == .channel)
        #expect(response.config.modelProviders.map(\.id) == ["minimax", "modelstudio", "openai"])
        #expect(response.config.modelProviders.map(\.label) == ["MiniMax", "Qwen (通义千问)", "ChatGPT"])
        #expect(response.config.modelProviders[0].platformUrl == "https://platform.minimaxi.com/login")
        #expect(response.config.modelProviders[0].tutorialVideoUrl == "https://video.example/minimax")
        #expect(response.config.modelProviders[1].defaultModelKey == "modelstudio/qwen3.5-plus")
        #expect(response.config.modelProviders[1].authMethods.map(\.id) == ["modelstudio-api-key-cn"])
        #expect(response.config.modelProviders[2].authMethods.map(\.id) == ["openai-api-key", "openai-codex"])
        #expect(response.config.channels.map(\.id) == ["wechat", "feishu", "telegram"])
        #expect(response.config.channels[1].platformUrl == "https://open.feishu.cn/app")
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

    @Test
    func daemonEventDecodesDeployAndChatPayloads() throws {
        let deployData = """
        {
          "type": "deploy.progress",
          "correlationId": "corr-1",
          "targetId": "managed-local",
          "phase": "installing",
          "percent": 50,
          "message": "Installing OpenClaw."
        }
        """.data(using: .utf8)!

        let deployEvent = try JSONDecoder.slackClaw.decode(SlackClawEvent.self, from: deployData)
        guard case let .deployProgress(correlationId, targetId, phase, percent, message) = deployEvent else {
            Issue.record("Expected deployProgress event")
            return
        }
        #expect(correlationId == "corr-1")
        #expect(targetId == "managed-local")
        #expect(phase == .installing)
        #expect(percent == 50)
        #expect(message == "Installing OpenClaw.")

        let chatData = """
        {
          "type": "chat.stream",
          "threadId": "thread-1",
          "sessionKey": "agent:agent-1:slackclaw-chat:thread-1",
          "payload": {
            "type": "assistant-delta",
            "threadId": "thread-1",
            "message": {
              "id": "message-1",
              "role": "assistant",
              "text": "hello",
              "status": "streaming"
            }
          }
        }
        """.data(using: .utf8)!

        let chatEvent = try JSONDecoder.slackClaw.decode(SlackClawEvent.self, from: chatData)
        guard case let .chatStream(threadId, sessionKey, payload) = chatEvent else {
            Issue.record("Expected chatStream event")
            return
        }
        #expect(threadId == "thread-1")
        #expect(sessionKey == "agent:agent-1:slackclaw-chat:thread-1")
        guard case let .assistantDelta(payloadThreadId, message, _) = payload else {
            Issue.record("Expected assistantDelta payload")
            return
        }
        #expect(payloadThreadId == "thread-1")
        #expect(message.text == "hello")
    }
}
