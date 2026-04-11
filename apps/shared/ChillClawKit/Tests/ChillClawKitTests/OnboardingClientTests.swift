import Foundation
import Testing
@testable import ChillClawClient
@testable import ChillClawProtocol

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
                        "id": "minimax-api",
                        "label": "MiniMax API Key (Global)",
                        "kind": "api-key",
                        "description": "Paste a MiniMax API key for the international endpoint at api.minimax.io.",
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
                        "id": "minimax-api-key-cn",
                        "label": "MiniMax API Key (China)",
                        "kind": "api-key",
                        "description": "Paste a MiniMax API key for the China endpoint at api.minimaxi.com.",
                        "interactive": false,
                        "fields": [
                          {
                            "id": "apiKey",
                            "label": "API Key",
                            "required": true,
                            "secret": true
                          }
                        ]
                      },
                      {
                        "id": "minimax-portal",
                        "label": "MiniMax OAuth (Global)",
                        "kind": "oauth",
                        "description": "Run the MiniMax Coding Plan OAuth flow for the international endpoint at api.minimax.io.",
                        "interactive": true,
                        "fields": []
                      },
                      {
                        "id": "minimax-portal-cn",
                        "label": "MiniMax OAuth (China)",
                        "kind": "oauth",
                        "description": "Run the MiniMax Coding Plan OAuth flow for the China endpoint at api.minimaxi.com.",
                        "interactive": true,
                        "fields": []
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
                        "id": "modelstudio-standard-api-key-cn",
                        "label": "Standard API Key (China)",
                        "kind": "api-key",
                        "description": "Use a pay-as-you-go Model Studio API key against the China endpoint.",
                        "interactive": false,
                        "fields": [
                          {
                            "id": "apiKey",
                            "label": "API Key",
                            "required": true,
                            "secret": true
                          }
                        ]
                      },
                      {
                        "id": "modelstudio-standard-api-key",
                        "label": "Standard API Key (Global)",
                        "kind": "api-key",
                        "description": "Use a pay-as-you-go Model Studio API key against the global endpoint.",
                        "interactive": false,
                        "fields": [
                          {
                            "id": "apiKey",
                            "label": "API Key",
                            "required": true,
                            "secret": true
                          }
                        ]
                      },
                      {
                        "id": "modelstudio-api-key-cn",
                        "label": "Coding Plan API Key (China)",
                        "kind": "api-key",
                        "description": "Use a Model Studio Coding Plan key against the China endpoint.",
                        "interactive": false,
                        "fields": [
                          {
                            "id": "apiKey",
                            "label": "API Key",
                            "required": true,
                            "secret": true
                          }
                        ]
                      },
                      {
                        "id": "modelstudio-api-key",
                        "label": "Coding Plan API Key (Global)",
                        "kind": "api-key",
                        "description": "Use a Model Studio Coding Plan key against the global endpoint.",
                        "interactive": false,
                        "fields": [
                          {
                            "id": "apiKey",
                            "label": "API Key",
                            "required": true,
                            "secret": true
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
                        "label": "OpenAI Codex OAuth",
                        "kind": "oauth",
                        "description": "Run the OpenAI Codex login flow.",
                        "interactive": true,
                        "fields": []
                      }
                    ]
                  }
                ],
                "channels": [
                  {
                    "id": "wechat-work",
                    "label": "WeChat Work (WeCom)",
                    "secondaryLabel": "企业微信",
                    "description": "Set up WeChat Work credentials for your digital employees.",
                    "theme": "wechat-work",
                    "setupKind": "wechat-work-guided",
                    "docsUrl": "https://work.weixin.qq.com/"
                  },
                  {
                    "id": "wechat",
                    "label": "WeChat",
                    "secondaryLabel": "微信",
                    "description": "Set up personal WeChat with a QR-first login flow.",
                    "theme": "wechat",
                    "setupKind": "wechat-guided"
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
                    "avatarPresetId": "onboarding-analyst",
                    "starterSkillLabels": ["Research Brief", "Status Writer"],
                    "toolLabels": ["Company handbook", "Delivery playbook"],
                    "presetSkillIds": ["research-brief", "status-writer"],
                    "knowledgePackIds": ["company-handbook", "delivery-playbook"],
                    "workStyles": [],
                    "defaultMemoryEnabled": true
                  }
                ]
              },
              "summary": {},
              "localRuntime": {
                "supported": true,
                "recommendation": "local",
                "supportCode": "supported",
                "status": "idle",
                "runtimeInstalled": false,
                "runtimeReachable": false,
                "modelDownloaded": false,
                "activeInOpenClaw": false,
                "summary": "Local AI is available on this Mac.",
                "detail": "ChillClaw recommends a starter Ollama tier for this Apple Silicon Mac."
              }
            }
            """
        )
        let client = ChillClawAPIClient(
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
        #expect(response.config.modelProviders.map(\.id) == ["minimax", "modelstudio", "openai"])
        #expect(response.config.channels.map(\.id) == [.wechatWork, .wechat, .feishu, .telegram])
        #expect(response.config.channels.map(\.setupKind) == [.wechatWorkGuided, .wechatGuided, .feishuGuided, .telegramGuided])
        #expect(response.config.employeePresets.first?.avatarPresetId == "onboarding-analyst")
        #expect(response.localRuntime?.recommendation == "local")
        #expect(response.localRuntime?.status == "idle")
        let request = try #require(await recorder.lastRequest())
        #expect(request.httpMethod == "GET")
        #expect(request.url?.absoluteString == "http://127.0.0.1:4545/api/onboarding/state?fresh=1")
    }

    @Test
    func navigateOnboardingUsesStepScopedPostBody() async throws {
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
                        "id": "minimax-api",
                        "label": "MiniMax API Key (Global)",
                        "kind": "api-key",
                        "description": "Paste a MiniMax API key for the international endpoint at api.minimax.io.",
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
                        "id": "minimax-api-key-cn",
                        "label": "MiniMax API Key (China)",
                        "kind": "api-key",
                        "description": "Paste a MiniMax API key for the China endpoint at api.minimaxi.com.",
                        "interactive": false,
                        "fields": [
                          {
                            "id": "apiKey",
                            "label": "API Key",
                            "required": true,
                            "secret": true
                          }
                        ]
                      },
                      {
                        "id": "minimax-portal",
                        "label": "MiniMax OAuth (Global)",
                        "kind": "oauth",
                        "description": "Run the MiniMax Coding Plan OAuth flow for the international endpoint at api.minimax.io.",
                        "interactive": true,
                        "fields": []
                      },
                      {
                        "id": "minimax-portal-cn",
                        "label": "MiniMax OAuth (China)",
                        "kind": "oauth",
                        "description": "Run the MiniMax Coding Plan OAuth flow for the China endpoint at api.minimaxi.com.",
                        "interactive": true,
                        "fields": []
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
                        "id": "modelstudio-standard-api-key-cn",
                        "label": "Standard API Key (China)",
                        "kind": "api-key",
                        "description": "Use a pay-as-you-go Model Studio API key against the China endpoint.",
                        "interactive": false,
                        "fields": [
                          {
                            "id": "apiKey",
                            "label": "API Key",
                            "required": true,
                            "secret": true
                          }
                        ]
                      },
                      {
                        "id": "modelstudio-standard-api-key",
                        "label": "Standard API Key (Global)",
                        "kind": "api-key",
                        "description": "Use a pay-as-you-go Model Studio API key against the global endpoint.",
                        "interactive": false,
                        "fields": [
                          {
                            "id": "apiKey",
                            "label": "API Key",
                            "required": true,
                            "secret": true
                          }
                        ]
                      },
                      {
                        "id": "modelstudio-api-key-cn",
                        "label": "Coding Plan API Key (China)",
                        "kind": "api-key",
                        "description": "Use a Model Studio Coding Plan key against the China endpoint.",
                        "interactive": false,
                        "fields": [
                          {
                            "id": "apiKey",
                            "label": "API Key",
                            "required": true,
                            "secret": true
                          }
                        ]
                      },
                      {
                        "id": "modelstudio-api-key",
                        "label": "Coding Plan API Key (Global)",
                        "kind": "api-key",
                        "description": "Use a Model Studio Coding Plan key against the global endpoint.",
                        "interactive": false,
                        "fields": [
                          {
                            "id": "apiKey",
                            "label": "API Key",
                            "required": true,
                            "secret": true
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
                        "label": "OpenAI Codex OAuth",
                        "kind": "oauth",
                        "description": "Run the OpenAI Codex login flow.",
                        "interactive": true,
                        "fields": []
                      }
                    ]
                  }
                ],
                "channels": [
                  {
                    "id": "wechat-work",
                    "label": "WeChat Work (WeCom)",
                    "secondaryLabel": "企业微信",
                    "description": "Set up WeChat Work credentials for your digital employees.",
                    "theme": "wechat-work",
                    "setupKind": "wechat-work-guided",
                    "docsUrl": "https://work.weixin.qq.com/"
                  },
                  {
                    "id": "wechat",
                    "label": "WeChat",
                    "secondaryLabel": "微信",
                    "description": "Set up personal WeChat with a QR-first login flow.",
                    "theme": "wechat",
                    "setupKind": "wechat-guided"
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
                    "avatarPresetId": "onboarding-analyst",
                    "starterSkillLabels": ["Research Brief", "Status Writer"],
                    "toolLabels": ["Company handbook", "Delivery playbook"],
                    "presetSkillIds": ["research-brief", "status-writer"],
                    "knowledgePackIds": ["company-handbook", "delivery-playbook"],
                    "workStyles": [],
                    "defaultMemoryEnabled": true
                  }
                ]
              },
              "summary": {}
            }
            """
        )
        let client = ChillClawAPIClient(
            session: session,
            configurationProvider: {
                .init(
                    daemonURL: URL(string: "http://127.0.0.1:4545")!,
                    fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
                )
            }
        )

        let response = try await client.navigateOnboarding(to: .model)

        #expect(response.draft.currentStep == .model)
        let request = try #require(await recorder.lastRequest())
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "http://127.0.0.1:4545/api/onboarding/navigate")
        let body = try #require(readRequestBody(request))
        let payload = try JSONDecoder.chillClaw.decode(OnboardingStepNavigationRequest.self, from: body)
        #expect(payload.step == .model)
    }

    @Test
    func resetOnboardingUsesPostEndpoint() async throws {
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
                "currentStep": "welcome"
              },
              "config": {
                "modelProviders": [],
                "channels": [],
                "employeePresets": []
              },
              "summary": {}
            }
            """
        )
        let client = ChillClawAPIClient(
            session: session,
            configurationProvider: {
                .init(
                    daemonURL: URL(string: "http://127.0.0.1:4545")!,
                    fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
                )
            }
        )

        let response = try await client.resetOnboarding()

        #expect(response.draft.currentStep == .welcome)
        let request = try #require(await recorder.lastRequest())
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "http://127.0.0.1:4545/api/onboarding/reset")
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
              "warmupTaskId": "onboarding-warmup-task-1",
              "summary": {},
              "overview": {
                "appName": "ChillClaw",
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
        let client = ChillClawAPIClient(
            session: session,
            configurationProvider: {
                .init(
                    daemonURL: URL(string: "http://127.0.0.1:4545")!,
                    fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
                )
            }
        )

        let employee = OnboardingEmployeeState(
            memberId: nil,
            name: "Ryo-AI",
            jobTitle: "Research Analyst",
            avatarPresetId: "onboarding-analyst",
            presetId: "research-analyst",
            personalityTraits: [],
            presetSkillIds: ["research-brief", "status-writer"],
            knowledgePackIds: ["company-handbook"],
            workStyles: ["Analytical"],
            memoryEnabled: true
        )

        let response = try await client.completeOnboarding(.init(destination: .chat, employee: employee))

        #expect(response.destination == .chat)
        #expect(response.warmupTaskId == "onboarding-warmup-task-1")
        let request = try #require(await recorder.lastRequest())
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "http://127.0.0.1:4545/api/onboarding/complete")
        #expect(request.timeoutInterval == 300)
        let body = try #require(readRequestBody(request))
        let payload = try JSONDecoder.chillClaw.decode(CompleteOnboardingRequest.self, from: body)
        #expect(payload.destination == .chat)
        #expect(payload.employee?.name == "Ryo-AI")
        #expect(payload.employee?.presetSkillIds == ["research-brief", "status-writer"])
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
                "appName": "ChillClaw",
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
        let client = ChillClawAPIClient(
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
        #expect(request.url?.absoluteString == "http://127.0.0.1:4545/api/onboarding/runtime/install")
        #expect(request.timeoutInterval == 300)
    }

    @Test
    func saveOnboardingModelEntryUsesExtendedTimeout() async throws {
        let recorder = RequestRecorder()
        let session = await recorder.session(
            statusCode: 200,
            body: """
            {
              "status": "completed",
              "message": "MiniMax API key was saved for OpenClaw.",
              "requiresGatewayApply": true,
              "modelConfig": {
                "providers": [],
                "models": [],
                "defaultModel": null,
                "configuredModelKeys": [],
                "savedEntries": [],
                "defaultEntryId": null,
                "fallbackEntryIds": []
              },
              "onboarding": {
                "firstRun": {
                  "introCompleted": true,
                  "setupCompleted": false
                },
                "draft": {
                  "currentStep": "model",
                  "model": {
                    "providerId": "minimax",
                    "modelKey": "minimax/MiniMax-M2.7",
                    "methodId": "minimax-api",
                    "entryId": "entry-1"
                  }
                },
                "config": {
                  "modelProviders": [],
                  "channels": [],
                  "employeePresets": []
                },
                "summary": {}
              }
            }
            """
        )
        let client = ChillClawAPIClient(
            session: session,
            configurationProvider: {
                .init(
                    daemonURL: URL(string: "http://127.0.0.1:4545")!,
                    fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
                )
            }
        )

        _ = try await client.saveOnboardingModelEntry(
            .init(
                label: "MiniMax MiniMax-M2.7",
                providerId: "minimax",
                methodId: "minimax-api",
                modelKey: "minimax/MiniMax-M2.7",
                values: ["apiKey": "sk-test-minimax"],
                makeDefault: true,
                useAsFallback: false
            )
        )

        let request = try #require(await recorder.lastRequest())
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "http://127.0.0.1:4545/api/onboarding/model/entries")
        #expect(request.timeoutInterval == 300)
    }

    @Test
    func saveOnboardingChannelEntryUsesExtendedTimeout() async throws {
        let recorder = RequestRecorder()
        let session = await recorder.session(
            statusCode: 200,
            body: """
            {
              "status": "interactive",
              "message": "Started WeChat login",
              "channelConfig": {
                "baseOnboardingCompleted": true,
                "capabilities": [],
                "entries": [],
                "activeSession": null,
                "gatewaySummary": "Gateway ready"
              },
              "session": null,
              "requiresGatewayApply": false,
              "onboarding": {
                "firstRun": {
                  "introCompleted": true,
                  "setupCompleted": false
                },
                "draft": {
                  "currentStep": "channel",
                  "channel": {
                    "channelId": "wechat",
                    "entryId": "wechat:default"
                  },
                  "activeChannelSessionId": "wechat:default:login"
                },
                "config": {
                  "modelProviders": [],
                  "channels": [],
                  "employeePresets": []
                },
                "summary": {}
              }
            }
            """
        )
        let client = ChillClawAPIClient(
            session: session,
            configurationProvider: {
                .init(
                    daemonURL: URL(string: "http://127.0.0.1:4545")!,
                    fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
                )
            }
        )

        _ = try await client.saveOnboardingChannelEntry(
            entryId: nil,
            request: .init(
                channelId: "wechat",
                entryId: nil,
                values: [:],
                action: "save"
            )
        )

        let request = try #require(await recorder.lastRequest())
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "http://127.0.0.1:4545/api/onboarding/channel/entries")
        #expect(request.timeoutInterval == 300)
    }

    @Test
    func chatEventsAreDerivedFromDaemonEvents() async throws {
        let session = URLSession(configuration: .ephemeral)
        let client = ChillClawAPIClient(
            session: session,
            configurationProvider: {
                .init(
                    daemonURL: URL(string: "http://127.0.0.1:4545")!,
                    fallbackWebURL: URL(string: "http://127.0.0.1:4545/")!
                )
            },
            daemonEventStreamFactory: { _ in
                AsyncThrowingStream { continuation in
                    continuation.yield(
                        """
                        {"type":"gateway.status","reachable":true,"pendingGatewayApply":false,"summary":"Ready"}
                        """.data(using: .utf8)!
                    )
                    continuation.yield(
                        """
                        {"type":"chat.stream","threadId":"thread-1","sessionKey":"agent:main:thread-1","payload":{"type":"assistant-delta","threadId":"thread-1","activityLabel":"Responding…","message":{"id":"assistant-1","role":"assistant","text":"Hello","status":"streaming"}}}
                        """.data(using: .utf8)!
                    )
                    continuation.finish()
                }
            }
        )

        let stream = try await client.chatEvents()
        var iterator = stream.makeAsyncIterator()
        let first = try await iterator.next()

        guard case let .assistantDelta(threadId, message, activityLabel)? = first else {
            Issue.record("Expected assistant delta from daemon chat.stream event")
            return
        }

        #expect(threadId == "thread-1")
        #expect(message.text == "Hello")
        #expect(activityLabel == "Responding…")
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
                    throw ChillClawClientError.invalidResponse
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
                client.urlProtocol(self, didFailWithError: ChillClawClientError.invalidResponse)
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
