# ChillClaw daemon backend map

This note shows the main backend objects wired in `apps/daemon/src/server.ts` and the engine-manager split defined in `apps/daemon/src/engine/adapter.ts`.

For the current HTTP route inventory, see `docs/reference/daemon-routes.md`.

## Daemon object graph

```mermaid
flowchart TB
  UI["Native clients<br/>React fallback UI"] -->|HTTP routes + /api/events| Server["startServer()<br/>HTTP server + WebSocket upgrade"]

  subgraph Shared["Shared daemon objects"]
    Adapter["EngineAdapter<br/>currently OpenClawAdapter"]
    Store["StateStore"]
    Secrets["SecretsAdapter<br/>macOS keychain by default"]
    EventBus["EventBusService"]
    Publisher["EventPublisher<br/>+ RevisionStore"]
    AppSvc["AppServiceManager"]
    AppCtrl["AppControlService"]
  end

  subgraph Services["Product services"]
    Overview["OverviewService"]
    Setup["SetupService"]
    Onboarding["OnboardingService"]
    Channels["ChannelSetupService"]
    Team["AITeamService"]
    Chat["ChatService"]
    Skills["SkillService"]
    Presets["PresetSkillService"]
    Plugins["PluginService"]
    Tasks["TaskService"]
    Feature["FeatureWorkflowService"]
  end

  Server --> EventBus
  Server --> AppCtrl
  Publisher --> EventBus

  Server --> Overview
  Server --> Setup
  Server --> Onboarding
  Server --> Channels
  Server --> Team
  Server --> Chat
  Server --> Skills
  Server --> Presets
  Server --> Plugins
  Server --> Tasks

  Overview --> Adapter
  Overview --> Store
  Overview --> AppSvc

  Setup --> Adapter
  Setup --> Store
  Setup --> Overview
  Setup --> Publisher
  Setup --> Presets

  Onboarding --> Adapter
  Onboarding --> Store
  Onboarding --> Overview
  Onboarding --> Channels
  Onboarding --> Team
  Onboarding --> Presets

  Channels --> Adapter
  Channels --> Store
  Channels --> Publisher
  Channels --> Secrets
  Channels --> Feature

  Feature --> Adapter

  Team --> Adapter
  Team --> Store
  Team --> Publisher
  Team --> Presets

  Chat --> Adapter
  Chat --> Store
  Chat --> Team
  Chat --> Publisher

  Skills --> Adapter
  Skills --> Store
  Skills --> Publisher
  Skills --> Presets

  Presets --> Adapter
  Presets --> Store
  Presets --> Publisher

  Plugins --> Adapter
  Plugins --> Publisher

  Tasks --> Adapter
  Tasks --> Store
  Tasks --> Publisher
```

## Engine manager split

```mermaid
flowchart LR
  Adapter["EngineAdapter"] --> OpenClaw["OpenClawAdapter"]
  OpenClaw --> Inst["instances<br/>OpenClawInstanceManager"]
  OpenClaw --> Conf["config<br/>OpenClawConfigManager"]
  OpenClaw --> AI["aiEmployees<br/>OpenClawAIEmployeeManager"]
  OpenClaw --> Gate["gateway<br/>OpenClawGatewayManager"]
  OpenClaw --> Plug["plugins<br/>OpenClawPluginManager"]

  subgraph Platform["Daemon-internal platform seams"]
    CLI["cli-runner.ts"]
    Socket["openclaw-gateway-socket-adapter.ts"]
    FS["filesystem-state-adapter.ts"]
    Keychain["macos-keychain-secrets-adapter.ts"]
  end

  State["StateStore"] --> FS
  SecretStore["SecretsAdapter"] --> Keychain

  Inst --> CLI
  Conf --> CLI
  AI --> CLI
  Gate --> CLI
  Gate --> Socket
  Plug --> CLI

  subgraph Runtime["Managed OpenClaw runtime"]
    OCLI["openclaw CLI"]
    OConfig["config + agent workspaces"]
    OGateway["gateway"]
    OPlugins["plugins + managed features"]
  end

  CLI --> OCLI
  OCLI --> OConfig
  OCLI --> OGateway
  OCLI --> OPlugins
  Socket --> OGateway
```

## Reading guide

- `StateStore` is ChillClaw-owned product state for onboarding, AI team data, stored channel entries, chat thread metadata, preset-skill sync state, and recent task history.
- `EventBusService` plus `EventPublisher` is the daemon-owned push path for retained snapshots, deploy progress, task progress, gateway state, and chat stream events.
- Product services stay engine-agnostic. They coordinate user-facing behavior and reach OpenClaw only through the `EngineAdapter` seam.
- OpenClaw-specific behavior is confined to the `OpenClaw*Manager` classes and the platform adapters in `apps/daemon/src/platform`.
