import Foundation
import Testing
@testable import ChillClawProtocol
@testable import ChillClawClient

struct ChillClawProtocolTests {
    @Test
    func modelConfigOverviewDecodesExtendedProviderMetadata() throws {
        let data = """
        {
          "providers": [
            {
              "id": "openai",
              "label": "OpenAI",
              "description": "OpenAI models.",
              "docsUrl": "https://docs.openclaw.ai/providers/openai",
              "providerRefs": ["openai/"],
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
                      "secret": true
                    }
                  ]
                }
              ],
              "exampleModels": ["openai/gpt-5.4", "openai/gpt-5.4-pro"],
              "authEnvVars": ["OPENAI_API_KEY", "OPENAI_API_KEYS"],
              "setupNotes": ["Default transport is auto (WebSocket-first, SSE fallback)."],
              "warnings": [],
              "providerType": "built-in",
              "supportsNoAuth": false,
              "configured": true,
              "modelCount": 2,
              "sampleModels": ["openai/gpt-5.4"]
            }
          ],
          "models": [],
          "configuredModelKeys": [],
          "savedEntries": [],
          "fallbackEntryIds": []
        }
        """.data(using: .utf8)!

        let overview = try JSONDecoder.chillClaw.decode(ModelConfigOverview.self, from: data)
        #expect(overview.providers.count == 1)
        #expect(overview.providers[0].exampleModels == ["openai/gpt-5.4", "openai/gpt-5.4-pro"])
        #expect(overview.providers[0].authEnvVars == ["OPENAI_API_KEY", "OPENAI_API_KEYS"])
        #expect(overview.providers[0].setupNotes == ["Default transport is auto (WebSocket-first, SSE fallback)."])
        #expect(overview.providers[0].warnings == [])
        #expect(overview.providers[0].providerType == "built-in")
        #expect(overview.providers[0].supportsNoAuth == false)
    }

    @Test
    func localRuntimeProgressEventDecodesExtendedProgressSnapshot() throws {
        let data = """
        {
          "type": "local-runtime.progress",
          "action": "install",
          "phase": "downloading-model",
          "message": "Downloading local model layer.",
          "localRuntime": {
            "supported": true,
            "recommendation": "local",
            "supportCode": "supported",
            "status": "downloading-model",
            "runtimeInstalled": true,
            "runtimeReachable": true,
            "modelDownloaded": false,
            "activeInOpenClaw": false,
            "recommendedTier": "medium",
            "requiredDiskGb": 16,
            "totalMemoryGb": 36,
            "freeDiskGb": 120,
            "chosenModelKey": "ollama/gemma4:e4b",
            "managedEntryId": "managed-ollama-entry",
            "summary": "Local AI is downloading.",
            "detail": "Downloading local model layer.",
            "activeAction": "install",
            "activePhase": "downloading-model",
            "progressMessage": "Downloading local model layer.",
            "progressDigest": "sha256:abc123",
            "progressCompletedBytes": 1024,
            "progressTotalBytes": 2048,
            "progressPercent": 50,
            "lastProgressAt": "2026-04-06T00:00:00.000Z"
          }
        }
        """.data(using: .utf8)!

        let event = try JSONDecoder.chillClaw.decode(ChillClawEvent.self, from: data)
        guard case let .localRuntimeProgress(action, phase, percent, message, localRuntime) = event else {
            Issue.record("Expected localRuntimeProgress event")
            return
        }

        #expect(action == "install")
        #expect(phase == "downloading-model")
        #expect(percent == nil)
        #expect(message == "Downloading local model layer.")
        #expect(localRuntime.activeAction == "install")
        #expect(localRuntime.progressDigest == "sha256:abc123")
        #expect(localRuntime.progressCompletedBytes == 1024)
        #expect(localRuntime.progressTotalBytes == 2048)
        #expect(localRuntime.progressPercent == 50)
    }

    @Test
    func downloadEventsDecodeBackendManagedJobs() throws {
        let updatedData = """
        {
          "type": "downloads.updated",
          "snapshot": {
            "epoch": "downloads-test",
            "revision": 4,
            "data": {
              "checkedAt": "2026-04-15T00:00:00.000Z",
              "jobs": [
                {
                  "id": "download-1",
                  "type": "model",
                  "artifactId": "ollama-model:gemma4:e2b",
                  "displayName": "Local model gemma4:e2b",
                  "source": {
                    "kind": "ollama-pull",
                    "modelTag": "gemma4:e2b"
                  },
                  "destinationPath": "/tmp/gemma4-e2b.json",
                  "tempPath": "/tmp/gemma4-e2b.part",
                  "downloadedBytes": 512,
                  "progress": 50,
                  "status": "downloading",
                  "priority": 20,
                  "silent": false,
                  "requester": "model-manager",
                  "dedupeKey": "model:ollama:gemma4:e2b",
                  "createdAt": 1770000000000,
                  "updatedAt": 1770000001000
                }
              ],
              "activeCount": 1,
              "queuedCount": 0,
              "failedCount": 0,
              "summary": "1 download is active."
            }
          }
        }
        """.data(using: .utf8)!

        let updated = try JSONDecoder.chillClaw.decode(ChillClawEvent.self, from: updatedData)
        guard case let .downloadsUpdated(snapshot) = updated else {
            Issue.record("Expected downloadsUpdated event")
            return
        }
        #expect(snapshot.revision == 4)
        #expect(snapshot.data.jobs.first?.source.modelTag == "gemma4:e2b")
        #expect(snapshot.data.jobs.first?.downloadedBytes == 512)

        let progressData = """
        {
          "type": "download.progress",
          "jobId": "download-1",
          "downloadedBytes": 1024,
          "totalBytes": 2048,
          "progress": 50,
          "speedBps": 4096
        }
        """.data(using: .utf8)!

        let progress = try JSONDecoder.chillClaw.decode(ChillClawEvent.self, from: progressData)
        guard case let .downloadProgress(jobId, downloadedBytes, totalBytes, progressPercent, speedBps) = progress else {
            Issue.record("Expected downloadProgress event")
            return
        }
        #expect(jobId == "download-1")
        #expect(downloadedBytes == 1024)
        #expect(totalBytes == 2048)
        #expect(progressPercent == 50)
        #expect(speedBps == 4096)

        let failedData = """
        {
          "type": "download.failed",
          "jobId": "download-1",
          "error": {
            "code": "checksum-mismatch",
            "message": "Downloaded checksum mismatch.",
            "retriable": true
          }
        }
        """.data(using: .utf8)!

        let failed = try JSONDecoder.chillClaw.decode(ChillClawEvent.self, from: failedData)
        guard case let .downloadFailed(jobId, error) = failed else {
            Issue.record("Expected downloadFailed event")
            return
        }
        #expect(jobId == "download-1")
        #expect(error.code == "checksum-mismatch")
        #expect(error.retriable == true)
    }

    @Test
    func productOverviewDecodesAppUpdateStatus() throws {
        let data = """
        {
          "appName": "ChillClaw",
          "appVersion": "0.1.2",
          "platformTarget": "macOS first",
          "appUpdate": {
            "status": "update-available",
            "supported": true,
            "currentVersion": "0.1.2",
            "latestVersion": "0.1.4",
            "downloadUrl": "https://github.com/Jian130/chillclaw/releases/download/v0.1.4/ChillClaw-macOS.dmg",
            "releaseUrl": "https://github.com/Jian130/chillclaw/releases/tag/v0.1.4",
            "publishedAt": "2026-04-04T10:00:00.000Z",
            "checkedAt": "2026-04-04T11:00:00.000Z",
            "summary": "ChillClaw 0.1.4 is available.",
            "detail": "Download the latest disk image."
          },
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
            "lastCheckedAt": "2026-04-04T11:00:00.000Z"
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
            "gatewaySummary": "Ready"
          },
          "profiles": [],
          "templates": [],
          "healthChecks": [],
          "recoveryActions": [],
          "recentTasks": []
        }
        """.data(using: .utf8)!

        let overview = try JSONDecoder.chillClaw.decode(ProductOverview.self, from: data)
        #expect(overview.appUpdate.status == "update-available")
        #expect(overview.appUpdate.latestVersion == "0.1.4")
        #expect(overview.appUpdate.downloadUrl?.hasSuffix("ChillClaw-macOS.dmg") == true)
    }

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
          "presetSkillSync": {
            "targetMode": "managed-local",
            "entries": [
              {
                "presetSkillId": "research-brief",
                "runtimeSlug": "research-brief",
                "targetMode": "managed-local",
                "status": "verified",
                "installedVersion": "1.0.0",
                "updatedAt": "2026-03-27T00:00:00.000Z"
              }
            ],
            "summary": "1 preset skill verified on the managed-local runtime.",
            "repairRecommended": false
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
          },
          "localRuntime": {
            "supported": true,
            "recommendation": "local",
            "supportCode": "supported",
            "status": "installing-runtime",
            "runtimeInstalled": false,
            "runtimeReachable": false,
            "modelDownloaded": false,
            "activeInOpenClaw": false,
            "summary": "Local AI is available on this Mac.",
            "detail": "ChillClaw recommends a starter Ollama tier for this Apple Silicon Mac."
          }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder.chillClaw.decode(OnboardingStateResponse.self, from: data)
        #expect(response.firstRun.setupCompleted == false)
        #expect(response.draft.currentStep == .channel)
        #expect(response.config.modelProviders.map(\.id) == ["minimax", "modelstudio", "openai"])
        #expect(response.config.modelProviders.map(\.label) == ["MiniMax", "Qwen (通义千问)", "ChatGPT"])
        #expect(response.config.modelProviders[0].platformUrl == "https://platform.minimaxi.com/login")
        #expect(response.config.modelProviders[0].tutorialVideoUrl == "https://video.example/minimax")
        #expect(response.config.modelProviders[1].defaultModelKey == "modelstudio/qwen3.5-plus")
        #expect(
            response.config.modelProviders[1].authMethods.map(\.id) == [
                "modelstudio-standard-api-key-cn",
                "modelstudio-standard-api-key",
                "modelstudio-api-key-cn",
                "modelstudio-api-key",
            ]
        )
        #expect(response.config.modelProviders[2].authMethods.map(\.id) == ["openai-api-key", "openai-codex"])
        #expect(response.config.channels.map(\.id) == [.wechatWork, .wechat, .feishu, .telegram])
        #expect(response.config.channels.map(\.setupKind) == [.wechatWorkGuided, .wechatGuided, .feishuGuided, .telegramGuided])
        #expect(response.config.channels[2].platformUrl == "https://open.feishu.cn/app")
        #expect(response.config.employeePresets.first?.avatarPresetId == "onboarding-analyst")
        #expect(response.config.employeePresets.first?.presetSkillIds == ["research-brief", "status-writer"])
        #expect(response.draft.install?.disposition == "reused-existing")
        #expect(response.draft.activeModelAuthSessionId == "session-1")
        #expect(response.presetSkillSync?.entries.first?.status == .verified)
        #expect(response.summary.model?.entryId == "entry-1")
        #expect(response.localRuntime?.recommendation == "local")
        #expect(response.localRuntime?.status == "installing-runtime")
    }

    @Test
    func completeOnboardingResponseDecodesWarmupTaskIdentifier() throws {
        let data = """
        {
          "status": "completed",
          "destination": "dashboard",
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
        """.data(using: .utf8)!

        let response = try JSONDecoder.chillClaw.decode(CompleteOnboardingResponse.self, from: data)

        #expect(response.destination == .dashboard)
        #expect(response.warmupTaskId == "onboarding-warmup-task-1")
    }

    @Test
    func productOverviewDecodesPendingGatewayApply() throws {
        let data = """
        {
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

        let overview = try JSONDecoder.chillClaw.decode(ProductOverview.self, from: data)
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

        let event = try JSONDecoder.chillClaw.decode(ChatStreamEvent.self, from: data)
        guard case let .assistantCompleted(threadId, detail, _) = event else {
            Issue.record("Expected assistantCompleted event")
            return
        }
        #expect(threadId == "thread-1")
        #expect(detail.messages.count == 1)
        #expect(detail.messages.first?.text == "hello")
    }

    @Test
    func chatStreamEventDecodesConnectionStateAndToolStatusPayloads() throws {
        let connectionData = """
        {
          "type": "connection-state",
          "threadId": "thread-1",
          "state": "reconnecting",
          "detail": "Waiting for the socket to reconnect."
        }
        """.data(using: .utf8)!
        let toolData = """
        {
          "type": "assistant-tool-status",
          "threadId": "thread-1",
          "sessionKey": "agent:main:test",
          "runId": "run-1",
          "activityLabel": "Inspecting workspace",
          "toolActivity": {
            "id": "tool-1",
            "label": "Inspecting workspace",
            "status": "running",
            "detail": "Reading files."
          }
        }
        """.data(using: .utf8)!

        let connectionEvent = try JSONDecoder.chillClaw.decode(ChatStreamEvent.self, from: connectionData)
        let toolEvent = try JSONDecoder.chillClaw.decode(ChatStreamEvent.self, from: toolData)

        guard case let .connectionState(threadId, state, detail) = connectionEvent else {
            Issue.record("Expected connectionState event")
            return
        }
        guard case let .assistantToolStatus(toolThreadId, sessionKey, runId, activityLabel, toolActivity) = toolEvent else {
            Issue.record("Expected assistantToolStatus event")
            return
        }

        #expect(threadId == "thread-1")
        #expect(state == .reconnecting)
        #expect(detail == "Waiting for the socket to reconnect.")
        #expect(toolThreadId == "thread-1")
        #expect(sessionKey == "agent:main:test")
        #expect(runId == "run-1")
        #expect(activityLabel == "Inspecting workspace")
        #expect(toolActivity.label == "Inspecting workspace")
        #expect(toolActivity.status == .running)
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
          "message": "ChillClaw completed setup.",
          "steps": [
            {
              "id": "install",
              "title": "Install OpenClaw",
              "status": "completed",
              "detail": "Installed latest"
            }
          ],
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

        let response = try JSONDecoder.chillClaw.decode(SetupRunResponse.self, from: data)
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

        let deployEvent = try JSONDecoder.chillClaw.decode(ChillClawEvent.self, from: deployData)
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
          "sessionKey": "agent:agent-1:chillclaw-chat:thread-1",
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

        let chatEvent = try JSONDecoder.chillClaw.decode(ChillClawEvent.self, from: chatData)
        guard case let .chatStream(threadId, sessionKey, payload) = chatEvent else {
            Issue.record("Expected chatStream event")
            return
        }
        #expect(threadId == "thread-1")
        #expect(sessionKey == "agent:agent-1:chillclaw-chat:thread-1")
        guard case let .assistantDelta(payloadThreadId, message, _) = payload else {
            Issue.record("Expected assistantDelta payload")
            return
        }
        #expect(payloadThreadId == "thread-1")
        #expect(message.text == "hello")

        let presetSkillEventData = """
        {
          "type": "preset-skill-sync.updated",
          "snapshot": {
            "epoch": "epoch-1",
            "revision": 3,
            "data": {
              "targetMode": "managed-local",
              "entries": [
                {
                  "presetSkillId": "research-brief",
                  "runtimeSlug": "research-brief",
                  "targetMode": "managed-local",
                  "status": "verified",
                  "updatedAt": "2026-03-27T00:00:00.000Z"
                }
              ],
              "summary": "1 preset skill verified on the managed-local runtime.",
              "repairRecommended": false
            }
          }
        }
        """.data(using: .utf8)!

        let presetSkillEvent = try JSONDecoder.chillClaw.decode(ChillClawEvent.self, from: presetSkillEventData)
        guard case let .presetSkillSyncUpdated(snapshot) = presetSkillEvent else {
            Issue.record("Expected presetSkillSyncUpdated event")
            return
        }
        #expect(snapshot.epoch == "epoch-1")
        #expect(snapshot.revision == 3)
        #expect(snapshot.data.entries.first?.presetSkillId == "research-brief")
    }

    @Test
    func daemonEventUsesSupportedChannelIdForChannelSessionUpdates() throws {
        let event = ChillClawEvent.channelSessionUpdated(
            channelId: .wechatWork,
            session: .init(
                id: "session-1",
                channelId: .wechatWork,
                entryId: "wechat-work:default",
                status: "ready",
                message: "Ready",
                logs: [],
                launchUrl: nil,
                inputPrompt: nil
            )
        )

        let data = try JSONEncoder.chillClaw.encode(event)
        let decoded = try JSONDecoder.chillClaw.decode(ChillClawEvent.self, from: data)

        guard case let .channelSessionUpdated(channelId, session) = decoded else {
            Issue.record("Expected channelSessionUpdated event")
            return
        }
        #expect(channelId == .wechatWork)
        #expect(session.channelId == .wechatWork)
        #expect(session.entryId == "wechat-work:default")
    }

    @Test
    func pluginConfigOverviewAndEventsDecodeManagedPlugins() throws {
        let overviewData = """
        {
          "entries": [
            {
              "id": "wecom",
              "label": "WeCom Plugin",
              "packageSpec": "@wecom/wecom-openclaw-plugin",
              "runtimePluginId": "wecom-openclaw-plugin",
              "configKey": "wecom-openclaw-plugin",
              "status": "update-available",
              "summary": "A newer managed plugin version is available.",
              "detail": "WeChat depends on this plugin.",
              "enabled": true,
              "installed": true,
              "hasUpdate": true,
              "hasError": false,
              "activeDependentCount": 1,
              "dependencies": [
                {
                  "id": "channel:wechat",
                  "label": "WeChat Work",
                  "kind": "channel",
                  "active": true,
                  "summary": "Configured through ChillClaw."
                }
              ]
            }
          ]
        }
        """.data(using: .utf8)!

        let overview = try JSONDecoder.chillClaw.decode(PluginConfigOverview.self, from: overviewData)
        #expect(overview.entries.first?.packageSpec == "@wecom/wecom-openclaw-plugin")
        #expect(overview.entries.first?.dependencies.first?.id == "channel:wechat")

        let eventData = """
        {
          "type": "plugin-config.updated",
          "snapshot": {
            "epoch": "plugins-epoch",
            "revision": 2,
            "data": {
              "entries": [
                {
                  "id": "wecom",
                  "label": "WeCom Plugin",
                  "packageSpec": "@wecom/wecom-openclaw-plugin",
                  "runtimePluginId": "wecom-openclaw-plugin",
                  "configKey": "wecom-openclaw-plugin",
                  "status": "ready",
                  "summary": "Plugin is ready.",
                  "detail": "Managed by ChillClaw.",
                  "enabled": true,
                  "installed": true,
                  "hasUpdate": false,
                  "hasError": false,
                  "activeDependentCount": 0,
                  "dependencies": []
                }
              ]
            }
          }
        }
        """.data(using: .utf8)!

        let event = try JSONDecoder.chillClaw.decode(ChillClawEvent.self, from: eventData)
        guard case let .pluginConfigUpdated(snapshot) = event else {
            Issue.record("Expected pluginConfigUpdated event")
            return
        }
        #expect(snapshot.epoch == "plugins-epoch")
        #expect(snapshot.data.entries.first?.runtimePluginId == "wecom-openclaw-plugin")
    }
}
