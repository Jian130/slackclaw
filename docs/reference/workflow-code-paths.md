# Workflow Code Paths

This reference maps the current ChillClaw workflow surface to the code paths that implement it today. It documents the checked-out code in this repo, not older design intent.

## Reading guide

- `Web entry`: React screen, provider, or browser boot path.
- `Native entry`: SwiftUI screen, view model, or app-state path.
- `Daemon route`: HTTP entry point under `apps/daemon/src/routes`.
- `Service path`: daemon orchestration layer.
- `Engine path`: adapter or manager layer that reaches OpenClaw.
- `Support`: shared state, eventing, secrets, or packaging helpers that materially affect the flow.

## Workflow summary

| Workflow | Web entry | Native entry | Daemon route(s) | Main service / engine path |
| --- | --- | --- | --- | --- |
| App startup and daemon boot | `apps/desktop-ui/src/main.tsx`, `apps/desktop-ui/src/app/routes.tsx` | `apps/macos-native/Sources/ChillClawNative/ChillClawNativeApp.swift`, `apps/macos-native/Sources/ChillClawNative/AppState.swift` | `GET /api/ping`, `GET /api/events` | `apps/daemon/src/index.ts` -> `apps/daemon/src/server.ts` -> `apps/daemon/src/routes/server-context.ts` |
| Overview and dashboard refresh | `apps/desktop-ui/src/app/providers/OverviewProvider.tsx`, `apps/desktop-ui/src/features/dashboard/DashboardPage.tsx` | `apps/macos-native/Sources/ChillClawNative/AppState.swift`, `apps/macos-native/Sources/ChillClawNative/Screens.swift` | `GET /api/overview`, `GET /api/ai-team/overview`, `GET /api/models/config` | `OverviewService`, `AITeamService`, `adapter.instances.status()`, `adapter.gateway.healthCheck()` |
| Deploy runtime lifecycle | `apps/desktop-ui/src/features/deploy/DeployPage.tsx` | `apps/macos-native/Sources/ChillClawNative/DeploySupport.swift`, `apps/macos-native/Sources/ChillClawNative/Screens.swift` | `GET /api/deploy/targets`, deploy target mutations, `POST /api/deploy/gateway/restart` | `adapter.instances.*`, `adapter.gateway.restartGateway()`, `EventPublisher` |
| Onboarding | `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx` | `apps/macos-native/Sources/ChillClawNative/OnboardingViewModel.swift`, `apps/macos-native/Sources/ChillClawNative/OnboardingView.swift` | `/api/onboarding/*`, `/api/first-run/*` | `OnboardingService`, `SetupService`, `ChannelSetupService`, `AITeamService`, `adapter.gateway.finalizeOnboardingSetup()` |
| Model configuration and auth | `apps/desktop-ui/src/features/config/ConfigPage.tsx`, onboarding page | `apps/macos-native/Sources/ChillClawNative/ConfigurationSupport.swift`, onboarding view model | `/api/models/*`, onboarding model routes | `adapter.config.*`, `apps/daemon/src/engine/openclaw-config-manager.ts`, model coordinators |
| Channel configuration and sessions | `apps/desktop-ui/src/features/config/ConfigPage.tsx`, onboarding page | `apps/macos-native/Sources/ChillClawNative/ConfigurationSupport.swift`, onboarding view model | `/api/channels/*`, onboarding channel routes, Feishu callback routes | `ChannelSetupService`, `FeatureWorkflowService`, `adapter.config.*`, `adapter.gateway.*`, channels coordinator |
| Chat threads and streaming | `apps/desktop-ui/src/features/chat/ChatPage.tsx` | `apps/macos-native/Sources/ChillClawNative/AppState.swift`, `apps/shared/ChillClawKit/Sources/ChillClawChatUI/ChatViewModel.swift` | `/api/chat/*`, `GET /api/events` | `ChatService`, `adapter.gateway.getChatThreadDetail()`, `sendChatMessage()`, `abortChatMessage()` |
| Skills and plugins | `apps/desktop-ui/src/features/skills/SkillsPage.tsx`, `apps/desktop-ui/src/features/plugins/PluginsPage.tsx` | `apps/macos-native/Sources/ChillClawNative/Screens.swift`, `apps/macos-native/Sources/ChillClawNative/AppState.swift` | `/api/skills/*`, `/api/plugins/*`, marketplace catalog routes | `SkillService`, `PluginService`, `PresetSkillService`, `adapter.config.*`, `adapter.plugins.*` |
| Task execution | client API only today | client API only today | `POST /api/tasks` | `TaskService` -> `adapter.gateway.runTask()` |

## 1. App startup and daemon boot

### Web path

- Browser entry starts in `apps/desktop-ui/src/main.tsx`, which renders `apps/desktop-ui/src/App.tsx`.
- Routing is defined in `apps/desktop-ui/src/app/routes.tsx`.
- `apps/desktop-ui/src/app/providers/OverviewProvider.tsx` performs the first authoritative read with `fetchOverview()` and subscribes to the shared daemon event stream.

### Native path

- `apps/macos-native/Sources/ChillClawNative/ChillClawNativeApp.swift` creates `ChillClawAppState`.
- `ChillClawAppState.bootstrap()` in `apps/macos-native/Sources/ChillClawNative/AppState.swift`:
  - ensures the daemon is running through `DaemonProcessManager`
  - refreshes endpoint reachability
  - fetches overview data
  - starts daemon event consumption
- LaunchAgent lifecycle lives in `apps/macos-native/Sources/ChillClawNative/DaemonManagers.swift`.

### Daemon path

- Local dev boot starts in `scripts/start-dev.mjs`.
- The daemon process starts in `apps/daemon/src/index.ts`.
- `apps/daemon/src/server.ts` creates the HTTP server, static fallback handler, and `/api/events` WebSocket upgrade path.
- `apps/daemon/src/routes/server-context.ts` wires the shared daemon object graph once per process.

### Support modules

- Web client event transport: `apps/desktop-ui/src/shared/api/events.ts`
- Native client event transport: `apps/shared/ChillClawKit/Sources/ChillClawClient/EventStreamClient.swift`
- Shared native HTTP client: `apps/shared/ChillClawKit/Sources/ChillClawClient/APIClient.swift`

## 2. Overview and dashboard refresh

### Entry points

- Web overview state is owned by `apps/desktop-ui/src/app/providers/OverviewProvider.tsx`.
- Web dashboard rendering lives in `apps/desktop-ui/src/features/dashboard/DashboardPage.tsx`.
- Native section refresh logic lives in `apps/macos-native/Sources/ChillClawNative/AppState.swift`.
- Native dashboard rendering lives in `apps/macos-native/Sources/ChillClawNative/Screens.swift`.

### Daemon routes

- `GET /api/overview`
- `GET /api/ai-team/overview`
- `GET /api/models/config`

### Service and engine path

- `OverviewProvider` and native app state both read `/api/overview`.
- `apps/daemon/src/routes/system.ts` delegates `GET /api/overview` to `OverviewService`.
- `apps/daemon/src/services/overview-service.ts` builds the overview from:
  - `adapter.instances.status()`
  - `adapter.gateway.healthCheck()`
  - `adapter.config.getChannelState("whatsapp")`
  - `StateStore`
  - `AppServiceManager`
- AI team overview reads come from `apps/daemon/src/routes/chat.ts` -> `AITeamService.getOverview()`.

### Support and eventing

- Snapshot events come from `apps/daemon/src/services/event-publisher.ts`.
- Web refresh rules live in `shouldRefreshOverviewForEvent()` inside `OverviewProvider.tsx`.
- Native refresh rules live in `shouldRefreshNativeOverviewForEvent()` and `shouldRefreshNativeSectionForEvent()` in `AppState.swift`.

### Notable gap

- Overview reads are live, but AI member and team mutation routes are not. The dashboard can read current team state even though standalone member/team writes still fail.

## 3. Deploy, install, update, uninstall, and service lifecycle

### Entry points

- Web deploy screen: `apps/desktop-ui/src/features/deploy/DeployPage.tsx`
- Native deploy support: `apps/macos-native/Sources/ChillClawNative/DeploySupport.swift`

### Daemon routes

- `GET /api/deploy/targets`
- `POST /api/deploy/targets/:targetId/install`
- `POST /api/deploy/targets/:targetId/update`
- `POST /api/deploy/targets/:targetId/uninstall`
- `POST /api/deploy/gateway/restart`
- `POST /api/update`
- `GET /api/service/status`
- `POST /api/service/install`
- `POST /api/service/restart`
- `POST /api/service/uninstall`

### Service and engine path

- `apps/daemon/src/routes/system.ts` handles the deploy and service routes.
- Runtime lifecycle routes call `adapter.instances.*`.
- Gateway restart calls `adapter.gateway.restartGateway()`.
- Packaged service routes call `AppServiceManager`.
- Runtime uninstall cleanup uses `apps/daemon/src/routes/runtime-reset.ts`.

### Support and eventing

- Deploy progress/completion events come from `EventPublisher.publishDeployProgress()` and `publishDeployCompleted()`.
- Gateway reachability events come from `EventPublisher.publishGatewayStatus()`.
- Local dev start/stop flows live in `scripts/start-dev.mjs`, `scripts/stop-dev.mjs`, and `scripts/dev-process-control.mjs`.

## 4. Onboarding

### Entry points

- Web route gating lives in `apps/desktop-ui/src/app/routes.tsx`.
- Web onboarding screen lives in `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`.
- Native onboarding boot and state live in `apps/macos-native/Sources/ChillClawNative/OnboardingViewModel.swift` and `apps/macos-native/Sources/ChillClawNative/OnboardingView.swift`.

### Daemon routes

- `GET /api/onboarding/state`
- `POST /api/onboarding/navigate`
- `POST /api/onboarding/runtime/detect`
- `POST /api/onboarding/runtime/install`
- `POST /api/onboarding/runtime/reuse`
- `POST /api/onboarding/runtime/update`
- `POST /api/onboarding/permissions/confirm`
- `POST /api/onboarding/model/entries`
- `GET/POST /api/onboarding/model/auth/session/:sessionId*`
- `POST/PATCH /api/onboarding/channel/entries*`
- `GET/POST /api/onboarding/channel/session/:sessionId*`
- `POST /api/onboarding/employee`
- `POST /api/onboarding/model/reset`
- `POST /api/onboarding/channel/reset`
- `POST /api/onboarding/reset`
- `POST /api/onboarding/complete`

### Service path

- Route handlers live in `apps/daemon/src/routes/onboarding.ts`.
- `apps/daemon/src/services/onboarding-service.ts` is the central flow kernel.
- `OnboardingService` delegates runtime install/update work to `SetupService`.
- Channel staging flows through `ChannelSetupService`.
- Finalization creates the AI employee through `AITeamService.saveMemberForOnboarding()`.
- Finalization then calls `adapter.gateway.finalizeOnboardingSetup()` and `adapter.aiEmployees.setPrimaryAIMemberAgent()`.

### Support modules

- Onboarding metadata: `apps/daemon/src/config/onboarding-config.ts`
- Preset metadata: `apps/daemon/src/config/ai-member-presets.ts`
- Draft persistence: `apps/daemon/src/services/state-store.ts`
- Mutation sync metadata: `apps/daemon/src/services/mutation-sync.ts`

### Notable gaps

- Personal WeChat still breaks the ideal config-only channel step by using a live login session.
- The completion API still accepts destination shortcuts, so finalization and post-completion navigation are not perfectly separated at the transport layer.

## 5. Model configuration and auth sessions

### Entry points

- Web config screen: `apps/desktop-ui/src/features/config/ConfigPage.tsx`
- Web onboarding model step: `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`
- Native configuration support: `apps/macos-native/Sources/ChillClawNative/ConfigurationSupport.swift`
- Native onboarding model step: `apps/macos-native/Sources/ChillClawNative/OnboardingViewModel.swift`

### Daemon routes

- `GET /api/models/config`
- `POST /api/models/entries`
- `PATCH /api/models/entries/:entryId`
- `DELETE /api/models/entries/:entryId`
- `POST /api/models/default-entry`
- `POST /api/models/fallbacks`
- `POST /api/models/auth`
- `GET/POST /api/models/auth/session/:sessionId*`
- `POST /api/models/default`

### Service and engine path

- The standard config routes in `apps/daemon/src/routes/models.ts` call `adapter.config.*` directly.
- Onboarding wraps the same engine path through `OnboardingService.saveModelEntry()` and auth-session helpers.
- The OpenClaw implementation is composed in `apps/daemon/src/engine/openclaw-adapter.ts`.
- The main lower-level managers are `apps/daemon/src/engine/openclaw-config-manager.ts`, `apps/daemon/src/engine/openclaw-models-config-coordinator.ts`, and `apps/daemon/src/engine/openclaw-capability-config-coordinator.ts`.

### Support and eventing

- Model snapshot events are published with `publishModelConfigUpdated()`.
- Web GET caching and fresh-read invalidation live in `apps/desktop-ui/src/shared/api/client.ts` and route `freshReadInvalidationTargets`.

## 6. Channel configuration, pairing, and channel sessions

### Entry points

- Web config screen: `apps/desktop-ui/src/features/config/ConfigPage.tsx`
- Web onboarding channel step: `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`
- Native configuration support: `apps/macos-native/Sources/ChillClawNative/ConfigurationSupport.swift`
- Native onboarding channel step: `apps/macos-native/Sources/ChillClawNative/OnboardingViewModel.swift`

### Daemon routes

- `GET /api/channels/config`
- `POST /api/channels/entries`
- `PATCH /api/channels/entries/:entryId`
- `DELETE /api/channels/entries/:entryId`
- `GET /api/channels/session/:sessionId`
- `POST /api/channels/session/:sessionId/input`
- `GET /api/channels/feishu/callback`
- `POST /api/channels/feishu/callback`
- Onboarding mirrors the same entry/session operations under `/api/onboarding/channel/*`

### Service and engine path

- Route handlers live in `apps/daemon/src/routes/channels.ts` and `apps/daemon/src/routes/onboarding.ts`.
- `apps/daemon/src/services/channel-setup-service.ts` owns channel config overview, staged entry storage, secret handling, and session follow-up.
- `ChannelSetupService` delegates prerequisite handling to `apps/daemon/src/services/feature-workflow-service.ts`.
- Engine calls flow through:
  - `adapter.config.saveChannelEntry()`
  - `adapter.config.getChannelState()`
  - `adapter.gateway.startWhatsappLogin()`
  - `adapter.gateway.prepareFeishu()`
  - `adapter.gateway.approvePairing()`
- The OpenClaw-specific command orchestration lives in `apps/daemon/src/engine/openclaw-channels-config-coordinator.ts`.

### Support modules

- Channel capability metadata is embedded in `channel-setup-service.ts`.
- Managed feature metadata lives in `apps/daemon/src/config/managed-features.ts`.
- Managed plugin metadata lives in `apps/daemon/src/config/managed-plugins.ts`.
- Secret persistence lives behind `apps/daemon/src/platform/secrets-adapter.ts` and `apps/daemon/src/platform/macos-keychain-secrets-adapter.ts`.

### Notable gap

- `ChannelSetupService` currently mixes channel catalog definitions, secrets, state persistence, prerequisite handling, and session orchestration in one file.

## 7. Chat thread creation, send, streaming, and abort

### Entry points

- Web chat screen: `apps/desktop-ui/src/features/chat/ChatPage.tsx`
- Native chat state is created in `apps/macos-native/Sources/ChillClawNative/AppState.swift` through `ChillClawChatViewModel`.
- Shared native chat UI logic lives in `apps/shared/ChillClawKit/Sources/ChillClawChatUI/ChatViewModel.swift`.

### Daemon routes

- `GET /api/chat/overview`
- `POST /api/chat/threads`
- `GET /api/chat/threads/:threadId`
- `POST /api/chat/threads/:threadId/messages`
- `POST /api/chat/threads/:threadId/abort`
- `GET /api/events`

### Service and engine path

- Route handlers live in `apps/daemon/src/routes/chat.ts`.
- `apps/daemon/src/services/chat-service.ts` owns thread persistence, optimistic state, bridge state, streaming merge logic, and fallback polling.
- Engine calls flow through:
  - `adapter.gateway.getChatThreadDetail()`
  - `adapter.gateway.subscribeToLiveChatEvents()`
  - `adapter.gateway.sendChatMessage()`
  - `adapter.gateway.abortChatMessage()`
- The OpenClaw gateway bridge lives behind `apps/daemon/src/platform/openclaw-gateway-socket-adapter.ts`.

### Support and eventing

- Live chat payloads are broadcast as `chat.stream` events through `EventPublisher.publishChatStream()`.
- Stored thread metadata lives in `StateStore.chat`.
- Web event filtering is in `chatStreamEventFromDaemonEvent()` inside `ChatPage.tsx`.

## 8. Skills and plugins

### Entry points

- Web skills screen: `apps/desktop-ui/src/features/skills/SkillsPage.tsx`
- Web plugins screen: `apps/desktop-ui/src/features/plugins/PluginsPage.tsx`
- Native section loading lives in `apps/macos-native/Sources/ChillClawNative/AppState.swift` and `apps/macos-native/Sources/ChillClawNative/Screens.swift`

### Daemon routes

- `GET /api/skills/config`
- `POST /api/skills/install`
- `POST /api/skills/custom`
- `POST /api/skills/preset-sync/repair`
- `PATCH /api/skills/:skillId`
- `DELETE /api/skills/:skillId`
- `GET /api/skills/marketplace/explore`
- `GET /api/skills/marketplace/search`
- `GET /api/skills/marketplace/:slug`
- `GET /api/skills/:skillId`
- `GET /api/plugins/config`
- `POST /api/plugins/:pluginId/install`
- `POST /api/plugins/:pluginId/update`
- `DELETE /api/plugins/:pluginId`

### Service and engine path

- `apps/daemon/src/services/skill-service.ts` builds the installed-skill view from runtime data plus ChillClaw-managed custom metadata.
- `apps/daemon/src/services/plugin-service.ts` fronts managed plugin install/update/remove flows.
- `apps/daemon/src/services/preset-skill-service.ts` reconciles preset-owned skills.
- Engine calls flow through `adapter.config.*` for marketplace/runtime skills and `adapter.plugins.*` for managed plugins.

### Support modules

- Skill custom metadata lives in `StateStore.skills`.
- Managed-plugin dependency metadata lives in `apps/daemon/src/config/managed-plugins.ts`.

## 9. Task execution

### Daemon route

- `POST /api/tasks`

### Service and engine path

- Route handler lives in `apps/daemon/src/routes/system.ts`.
- `apps/daemon/src/services/task-service.ts` enriches task requests with `memberAgentId` from `StateStore.aiTeam`.
- Execution then goes to `adapter.gateway.runTask()`.
- Task progress events are published through `EventPublisher.publishTaskProgress()`.

### Notable gap

- The backend supports task execution and recent-task persistence, but the initiating UI surfaces are thinner than the backend pathway itself.

## 10. AI team overview vs mutation gap

This is a cross-cutting workflow problem worth keeping in view while reading the repo:

- `GET /api/ai-team/overview` is live in `apps/daemon/src/routes/chat.ts` and backed by `AITeamService.getOverview()`.
- The mutation routes for `/api/ai-members/*` and `/api/teams/*` in the same route file currently return explicit `501`.
- Web still exposes those mutation methods through `apps/desktop-ui/src/app/providers/AITeamProvider.tsx`.
- Native still exposes those mutation methods through `apps/shared/ChillClawKit/Sources/ChillClawClient/APIClient.swift`.
- The web members screen and native screens still call those stale mutation endpoints.

Today that means team state is readable across dashboard, team, chat, and onboarding follow-up, but standalone member/team CRUD is still a dead-end until the new route surface is restored.
