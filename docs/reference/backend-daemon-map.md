# ChillClaw daemon backend map

This note shows the main backend objects wired in `apps/daemon/src/server.ts` and the engine-manager split defined in `apps/daemon/src/engine/adapter.ts`.

For the current HTTP route inventory, see `docs/reference/daemon-routes.md`.

## Daemon object graph

```mermaid
flowchart TB
  UI["Native clients<br/>React fallback UI"] -->|HTTP routes + /api/events| Server["startServer()<br/>HTTP server + WebSocket upgrade"]

  subgraph Shared["Shared daemon objects"]
    Adapter["EngineAdapter<br/>currently OpenClawAdapter"]
    RuntimeManager["RuntimeManager<br/>managed prerequisites"]
    DownloadManager["DownloadManager<br/>queued artifact transfers"]
    Store["StateStore"]
    Secrets["SecretsAdapter<br/>macOS keychain by default"]
    EventBus["EventBusService"]
    Publisher["EventPublisher<br/>+ RevisionStore"]
    AppSvc["AppServiceManager"]
    AppUpdate["AppUpdateService"]
    AppCtrl["AppControlService"]
  end

  subgraph Services["Product services"]
    Overview["OverviewService"]
    LocalRuntime["LocalModelRuntimeService"]
    Setup["SetupService"]
    Onboarding["OnboardingService"]
    Channels["ChannelSetupService"]
    Team["AITeamService"]
    Chat["ChatService"]
    Skills["SkillService"]
    Presets["PresetSkillService"]
    Plugins["PluginService"]
    Tasks["TaskService"]
    Feature["FeatureWorkflowService<br/>(inside ChannelSetupService)"]
  end

  Server --> EventBus
  Server --> AppCtrl
  Server --> AppUpdate
  Server --> DownloadManager
  Publisher --> EventBus
  RuntimeManager --> Publisher
  RuntimeManager --> DownloadManager
  DownloadManager --> EventBus

  Server --> Overview
  Server --> RuntimeManager
  Server --> LocalRuntime
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
  Overview --> RuntimeManager
  Overview --> Store
  Overview --> AppSvc
  Overview --> AppUpdate
  Overview --> LocalRuntime

  LocalRuntime --> Adapter
  LocalRuntime --> Store
  LocalRuntime --> Publisher
  LocalRuntime --> RuntimeManager
  LocalRuntime --> DownloadManager

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
  Onboarding --> LocalRuntime

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
  RuntimeManager["RuntimeManager"] --> Node["node-npm-runtime"]
  RuntimeManager --> OpenClawRuntime["openclaw-runtime"]
  RuntimeManager --> Ollama["ollama-runtime"]
  RuntimeManager --> Catalog["local-model-catalog"]

  Adapter["EngineAdapter"] --> OpenClaw["OpenClawAdapter"]
  OpenClaw --> RuntimeManager
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
- `DownloadManager` is the daemon-owned transfer subsystem for runtime artifacts, file artifacts, Ollama model pulls, persistent queue state, temp/cache storage, retained download snapshots, and live job events. Callers own intent; DownloadManager owns bytes, validation, dedupe, pause/resume, cancel, and recovery.
- `RuntimeManager` owns generic prerequisite lifecycle for Node/npm, managed OpenClaw, Ollama, and local model catalog metadata. It is manifest-driven and update-aware, but OpenClaw-specific product behavior still stays inside `OpenClawAdapter`.
- `AppUpdateService` owns packaged app release checks. It feeds overview/settings state but does not manage prerequisite runtimes.
- `LocalModelRuntimeService` owns managed local-model setup state and the handoff from Ollama readiness to OpenClaw model entries; Ollama model pull transfer state is represented as DownloadManager jobs while existing local-runtime progress snapshots remain for current clients.
- `FeatureWorkflowService` is a helper used by `ChannelSetupService` for feature prerequisites such as OpenClaw plugins or external installers; it is not a separately wired server-context singleton.
- Product services stay engine-agnostic. They coordinate user-facing behavior and reach OpenClaw only through the `EngineAdapter` seam.
- OpenClaw-specific behavior is confined to the `OpenClaw*Manager` classes and the platform adapters in `apps/daemon/src/platform`.
