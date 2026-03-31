# ChillClaw Daemon Routes

This document lists the current daemon HTTP surface after the route-module refactor in `apps/daemon/src/routes`.

## Routing Notes

- `apps/daemon/src/server.ts` is now the transport shell. It parses the request URL, resolves a route definition by method plus `pathname`, applies any `fresh=1` cache invalidation targets, and then delegates to the matching route handler.
- `GET /api/events` is a special case:
  - plain HTTP returns `426 Upgrade required`
  - WebSocket upgrade on `/api/events` streams retained and live daemon events
- Non-`/api/*` `GET` requests fall through to static asset serving for the packaged React UI.
- Some read routes support `?fresh=1` to invalidate adapter read caches before loading data.
- Legacy AI team routes still exist temporarily, but the backend now returns `501` to make the removal explicit.

## `routes/system.ts`

| Method | Path | Primary owner | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/ping` | route module | Basic daemon reachability check. |
| `GET` | `/api/events` | server shell + route module | Reject plain HTTP and instruct clients to use WebSocket upgrade. |
| `GET` | `/api/overview` | `OverviewService` | Return the product overview used by app shells and dashboards. |
| `GET` | `/api/deploy/targets` | `adapter.instances` | List deployment targets and runtime install choices. |
| `POST` | `/api/deploy/targets/:targetId/install` | `adapter.instances` + `EventPublisher` | Install the selected OpenClaw runtime target and publish deploy progress/completion events. |
| `POST` | `/api/deploy/targets/:targetId/update` | `adapter.instances` + `EventPublisher` | Update the selected OpenClaw runtime target and publish deploy events. |
| `POST` | `/api/deploy/targets/:targetId/uninstall` | `adapter.instances` + `EventPublisher` | Remove the selected runtime target and clear runtime uninstall state when appropriate. |
| `POST` | `/api/deploy/gateway/restart` | `adapter.gateway` + `EventPublisher` | Restart the OpenClaw gateway and publish reachability state. |
| `POST` | `/api/install` | `adapter.instances` + `OverviewService` | Run the older combined install flow and return the updated overview. |
| `POST` | `/api/engine/uninstall` | `adapter.instances` + `OverviewService` | Uninstall the engine and clear stored runtime state when the runtime is truly gone. |
| `GET` | `/api/plugins/config` | `PluginService` | Return managed plugin configuration visible to ChillClaw. |
| `GET` | `/api/skills/config` | `SkillService` | Return installed skill catalog and preset skill sync state. |
| `POST` | `/api/skills/install` | `SkillService` | Install a marketplace skill. |
| `POST` | `/api/skills/custom` | `SkillService` | Create a custom skill managed by ChillClaw. |
| `POST` | `/api/skills/preset-sync/repair` | `SkillService` | Re-run preset skill verification and repair. |
| `PATCH` | `/api/skills/:skillId` | `SkillService` | Update a managed or custom skill action. |
| `DELETE` | `/api/skills/:skillId` | `SkillService` | Remove an installed skill. |
| `POST` | `/api/plugins/:pluginId/install` | `PluginService` | Install a managed plugin. |
| `POST` | `/api/plugins/:pluginId/update` | `PluginService` | Update a managed plugin. |
| `DELETE` | `/api/plugins/:pluginId` | `PluginService` | Remove a managed plugin. |
| `POST` | `/api/tasks` | `TaskService` | Run an engine task through the gateway/task path. |
| `POST` | `/api/update` | `adapter.instances` | Run the general engine update flow. |
| `GET` | `/api/service/status` | `AppServiceManager` | Report packaged daemon service status. |
| `POST` | `/api/service/install` | `AppServiceManager` + `OverviewService` | Install the packaged app service and return refreshed overview data. |
| `POST` | `/api/service/restart` | `AppServiceManager` + `OverviewService` | Restart the packaged app service and return refreshed overview data. |
| `POST` | `/api/service/uninstall` | `AppServiceManager` + `OverviewService` | Remove the packaged app service and return refreshed overview data. |
| `POST` | `/api/app/stop` | `AppControlService` | Stop the desktop app from the daemon side. |
| `POST` | `/api/app/uninstall` | `AppControlService` | Run packaged app uninstall behavior. |
| `GET` | `/api/diagnostics` | `adapter.instances` | Export a diagnostics bundle and write it into the ChillClaw data directory. |
| `POST` | `/api/recovery/:actionId` | `OverviewService` + `adapter.instances` | Resolve a recovery action from overview metadata and execute repair. |

## `routes/models.ts`

| Method | Path | Primary owner | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/models/config` | `adapter.config` | Return current saved model entries, defaults, fallbacks, and provider metadata. |
| `POST` | `/api/models/entries` | `adapter.config` + `EventPublisher` | Create a saved model entry. |
| `PATCH` | `/api/models/entries/:entryId` | `adapter.config` + `EventPublisher` | Edit a saved model entry. |
| `DELETE` | `/api/models/entries/:entryId` | `adapter.config` + `EventPublisher` | Remove a saved model entry. |
| `POST` | `/api/models/default-entry` | `adapter.config` + `EventPublisher` | Mark one saved entry as the default model entry. |
| `POST` | `/api/models/fallbacks` | `adapter.config` + `EventPublisher` | Replace the saved fallback model set. |
| `POST` | `/api/models/auth` | `adapter.config` + `EventPublisher` | Start or apply provider authentication for a model configuration flow. |
| `GET` | `/api/models/auth/session/:sessionId` | `adapter.config` | Read the current model auth session state. |
| `POST` | `/api/models/auth/session/:sessionId/input` | `adapter.config` + `EventPublisher` | Submit follow-up input into a model auth session. |
| `POST` | `/api/models/default` | `adapter.config` + `EventPublisher` | Set the runtime default model by model key. |

## `routes/onboarding.ts`

| Method | Path | Primary owner | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/first-run/intro` | `StateStore` via `OnboardingService` helpers | Mark the intro screen as completed and return updated overview-first-run state. |
| `POST` | `/api/first-run/setup` | `SetupService` | Run the first-run setup/install flow. |
| `GET` | `/api/onboarding/state` | `OnboardingService` | Return the full guided onboarding draft, summary, and daemon-owned curated config metadata. |
| `POST` | `/api/onboarding/navigate` | `OnboardingService` | Move between onboarding steps while preserving the draft. |
| `POST` | `/api/onboarding/runtime/detect` | `OnboardingService` | Detect existing runtime state for onboarding. |
| `POST` | `/api/onboarding/runtime/install` | `SetupService` | Install a managed onboarding runtime. |
| `POST` | `/api/onboarding/runtime/reuse` | `OnboardingService` | Accept a reused runtime and advance onboarding state. |
| `POST` | `/api/onboarding/runtime/update` | `SetupService` | Update the onboarding runtime path before continuing. |
| `POST` | `/api/onboarding/permissions/confirm` | `OnboardingService` | Record that onboarding permission guidance was acknowledged. |
| `POST` | `/api/onboarding/model/entries` | `OnboardingService` | Save a model entry specifically for the onboarding draft flow. |
| `GET` | `/api/onboarding/model/auth/session/:sessionId` | `OnboardingService` | Read an onboarding-scoped model auth session. |
| `POST` | `/api/onboarding/model/auth/session/:sessionId/input` | `OnboardingService` | Submit input into an onboarding model auth session and update draft state. |
| `POST` | `/api/onboarding/channel/entries` | `OnboardingService` + `ChannelSetupService` | Save a channel entry within the onboarding flow. |
| `PATCH` | `/api/onboarding/channel/entries/:entryId` | `OnboardingService` + `ChannelSetupService` | Edit an onboarding channel entry. |
| `GET` | `/api/onboarding/channel/session/:sessionId` | `OnboardingService` + `ChannelSetupService` | Read an onboarding channel login or pairing session. |
| `POST` | `/api/onboarding/channel/session/:sessionId/input` | `OnboardingService` + `ChannelSetupService` | Submit input into an onboarding channel session. |
| `POST` | `/api/onboarding/employee` | `OnboardingService` | Save the onboarding employee draft and preset-derived settings. |
| `POST` | `/api/onboarding/model/reset` | `OnboardingService` | Reset the onboarding model draft section. |
| `POST` | `/api/onboarding/channel/reset` | `OnboardingService` | Reset the onboarding channel draft section. |
| `POST` | `/api/onboarding/reset` | `OnboardingService` | Reset guided onboarding back to the beginning. |
| `POST` | `/api/onboarding/complete` | `OnboardingService` | Finalize onboarding, create the initial AI employee, and commit the resulting app state. |

## `routes/channels.ts`

| Method | Path | Primary owner | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/channels/config` | `ChannelSetupService` | Return configured channels, channel capabilities, and any active channel session state. |
| `POST` | `/api/channels/entries` | `ChannelSetupService` | Create a channel entry outside onboarding. |
| `PATCH` | `/api/channels/entries/:entryId` | `ChannelSetupService` | Edit a channel entry outside onboarding. |
| `DELETE` | `/api/channels/entries/:entryId` | `ChannelSetupService` | Remove a configured channel entry. |
| `GET` | `/api/channels/session/:sessionId` | `ChannelSetupService` | Read the live state of a channel setup or pairing session. |
| `POST` | `/api/channels/session/:sessionId/input` | `ChannelSetupService` | Submit pairing code or follow-up input to a channel session. |
| `GET` | `/api/channels/feishu/callback` | route module | Reachability callback endpoint for Feishu setup probes. |
| `POST` | `/api/channels/feishu/callback` | route module | Feishu callback endpoint that currently answers challenge-style requests with a simple acknowledgment. |

## `routes/catalog.ts`

This module is intentionally read-only.

| Method | Path | Primary owner | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/skills/marketplace/explore` | `adapter.config` | Return a default marketplace exploration list for discovery surfaces. |
| `GET` | `/api/skills/marketplace/search` | `SkillService` | Search marketplace skills by query string `q`. |
| `GET` | `/api/skills/marketplace/:slug` | `SkillService` | Return marketplace detail for one skill slug. |
| `GET` | `/api/skills/:skillId` | `SkillService` | Return installed skill detail for one local skill. |

## `routes/chat.ts`

| Method | Path | Primary owner | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/ai-team/overview` | `AITeamService` | Return the daemon-owned AI team overview used by dashboard, team, members, and chat member pickers. |
| `GET` | `/api/chat/overview` | `ChatService` | Return direct-chat thread summaries. |
| `POST` | `/api/chat/threads` | `ChatService` | Create a new direct chat thread, or reuse a recent one when requested. |
| `GET` | `/api/chat/threads/:threadId` | `ChatService` | Return one thread detail with history and current composer state. |
| `POST` | `/api/chat/threads/:threadId/messages` | `ChatService` | Send a direct chat message into a thread. |
| `POST` | `/api/chat/threads/:threadId/abort` | `ChatService` | Abort the active assistant reply for a thread. |

### Temporarily unsupported legacy AI team mutation routes

These routes are still registered so older clients fail explicitly instead of falling through to a generic `404`. Read access for `/api/ai-team/overview` is still live; the mutation and binding routes below currently return `501`.

| Method | Path | Current behavior |
| --- | --- | --- |
| `GET` | `/api/ai-members/:memberId/bindings` | Returns `501`. |
| `POST` | `/api/ai-members` | Returns `501`. |
| `PATCH` | `/api/ai-members/:memberId` | Returns `501`. |
| `POST` | `/api/ai-members/:memberId/bindings` | Returns `501`. |
| `DELETE` | `/api/ai-members/:memberId/bindings` | Returns `501`. |
| `DELETE` | `/api/ai-members/:memberId` | Returns `501`. |
| `POST` | `/api/teams` | Returns `501`. |
| `PATCH` | `/api/teams/:teamId` | Returns `501`. |
| `DELETE` | `/api/teams/:teamId` | Returns `501`. |

## Ownership Summary

- The server shell owns transport concerns: request parsing, route resolution, cache invalidation, WebSocket upgrades, and static asset fallback.
- Most ChillClaw business orchestration lives in daemon services such as `OverviewService`, `OnboardingService`, `ChannelSetupService`, `ChatService`, `SkillService`, `PluginService`, and `TaskService`.
- Engine-specific behavior stays behind `EngineAdapter` and its OpenClaw implementation.
