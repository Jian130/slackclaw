# OpenClaw CLI and Config Reference

This document is the ChillClaw team's internal reference for the upstream OpenClaw CLI surface and configuration model.

It has three jobs:

- summarize the upstream CLI surface area we need to understand
- provide a practical operator cheat sheet
- map the main configurable objects and sidecar files behind `~/.openclaw`

This is broader than the small subset of commands ChillClaw shells out to today.

## Scope and sources

This page was refreshed against the official OpenClaw docs on `2026-03-30`.

Primary upstream docs:

- [CLI reference](https://docs.openclaw.ai/cli)
- [Configuration](https://docs.openclaw.ai/gateway/configuration)
- [Configuration reference](https://docs.openclaw.ai/gateway/configuration-reference)
- [Memory configuration reference](https://docs.openclaw.ai/reference/memory-config)
- [Plugins](https://docs.openclaw.ai/cli/plugins)
- [configure](https://docs.openclaw.ai/cli/configure)
- [Cron jobs](https://docs.openclaw.ai/automation/cron-jobs)

Relevant ChillClaw integration files:

- [apps/daemon/src/engine/openclaw-adapter.ts](/Users/home/Ryo/Projects/chillclaw/apps/daemon/src/engine/openclaw-adapter.ts)
- [scripts/bootstrap-openclaw.mjs](/Users/home/Ryo/Projects/chillclaw/scripts/bootstrap-openclaw.mjs)

## Mental model

OpenClaw is not just a chat CLI. It is a combined:

- setup and configuration tool
- local gateway and service manager
- model and credential router
- channel and messaging runtime
- agent, session, and memory runtime
- plugin, hook, browser, sandbox, and automation platform

The most important product constraint for ChillClaw remains the same:

- ChillClaw owns the product UX and daemon workflows
- the frontend should not call OpenClaw directly
- engine-specific behavior should stay confined to the adapter layer

Operationally, OpenClaw is centered on a strict JSON5 config at `~/.openclaw/openclaw.json`. Unknown keys or invalid values can stop the gateway from booting. Some important auth and runtime state also lives outside that file in sidecar files such as `auth-profiles.json`, channel credential folders, agent workspaces, and session stores.

## CLI surface summary

The upstream CLI surface is broad. The major namespaces we reviewed break down like this:

- Setup and repair: `setup`, `onboard`, `configure`, `config`, `doctor`, `backup`, `reset`, `uninstall`, `update`
- Runtime and health: `status`, `health`, `logs`, `gateway`, `system`, `sessions`
- Models and auth: `models`, `models auth`, `models aliases`, `models fallbacks`
- Channels and messaging: `channels`, `message`, `pairing`
- Agents and memory: `agent`, `agents`, `memory`
- Plugins and extensions: `plugins`, `skills`, `hooks`, `webhooks`
- Sandboxing and approvals: `sandbox`, `approvals`
- Browser and automation: `browser`, `cron`, `docs`
- Distributed and device features: `acp`, `node`, `nodes`, `devices`, `directory`, `dns`

OpenClaw also supports chat-side slash commands such as `/status`, `/config`, and `/debug`, but ChillClaw should continue to surface product flows through daemon-owned UI instead of relying on end users to memorize CLI or slash-command behavior.

## Cheat sheet

This section is intentionally high-signal instead of exhaustive. These are the commands most useful when debugging ChillClaw's OpenClaw integration.

### Setup and config

```bash
openclaw setup
openclaw onboard
openclaw configure
openclaw config file
openclaw config schema > openclaw.schema.json
openclaw config get agents.defaults.workspace
openclaw config set agents.defaults.heartbeat.every "2h"
openclaw config unset plugins.entries.example.enabled
openclaw config validate --json
openclaw doctor
openclaw doctor --fix --yes
```

### Runtime, health, and logs

```bash
openclaw --version
openclaw status --json
openclaw status --all
openclaw status --deep
openclaw health --json
openclaw logs --follow
openclaw logs --limit 200
openclaw gateway status --json
openclaw gateway health
openclaw gateway restart
openclaw gateway call config.get --params '{}'
```

### Models and provider auth

```bash
openclaw models list --json
openclaw models list --all --json
openclaw models status --json
openclaw models set <provider/model>
openclaw models set-image <provider/model>
openclaw models aliases list
openclaw models fallbacks list
openclaw models auth login --provider <provider>
openclaw models auth setup-token --provider <provider> --yes
openclaw models auth paste-token --provider <provider> --profile-id <id>
openclaw models auth order get
```

### Channels and messaging

```bash
openclaw channels list --json
openclaw channels status --json --probe
openclaw channels add --channel telegram --token <token>
openclaw channels login --channel whatsapp --verbose
openclaw channels logout --channel whatsapp --account default
openclaw channels remove --channel telegram --account default --delete
openclaw pairing approve <channelId> <code> --notify
openclaw message send --channel <channel> --target <target> --message "hello"
openclaw message search --channel <channel> --query "error"
openclaw message thread list --channel <channel> --limit 20 --json
```

### Agents, sessions, and memory

```bash
openclaw agents list --json --bindings
openclaw agents add <agentId> --agent-dir <agentDir> --workspace <workspaceDir> --model <provider/model> --non-interactive --json
openclaw agents bindings --agent <agentId> --json
openclaw agents bind --agent <agentId> --bind telegram:default --json
openclaw agents unbind --agent <agentId> --bind telegram:default --json
openclaw agents set-identity --agent <agentId> --name <name> --emoji <emoji> --json
openclaw agent --local --json --agent <agentId> --message <prompt>
openclaw sessions --json
openclaw memory status
openclaw memory index --agent <agentId> --force
openclaw memory search "customer issue"
```

### Plugins, hooks, and automation

```bash
openclaw plugins list
openclaw plugins install <package-or-path>
openclaw plugins enable <id>
openclaw plugins disable <id>
openclaw plugins update --all
openclaw plugins doctor
openclaw hooks list
openclaw hooks info <id>
openclaw hooks enable <id>
openclaw hooks disable <id>
openclaw cron list
openclaw cron add --help
openclaw cron runs
```

### Sandbox, browser, and tooling

```bash
openclaw sandbox explain
openclaw sandbox list
openclaw approvals get --json
openclaw browser status
openclaw browser start
openclaw browser tabs
openclaw browser screenshot
openclaw docs "allowHostControl"
```

## Config object tree

This is a practical tree of the main object families, not a leaf-by-leaf schema dump. Use `openclaw config schema` when you need the generated full schema.

```text
~/.openclaw/
|-- openclaw.json
|   |-- agents
|   |   |-- defaults
|   |   |   |-- workspace
|   |   |   |-- userTimezone
|   |   |   |-- timeFormat
|   |   |   |-- skipBootstrap
|   |   |   |-- bootstrapMaxChars
|   |   |   |-- bootstrapTotalMaxChars
|   |   |   |-- imageMaxDimensionPx
|   |   |   |-- model
|   |   |   |   |-- primary
|   |   |   |   `-- fallbacks[]
|   |   |   |-- imageModel
|   |   |   |-- models
|   |   |   |   `-- "<provider/model>"
|   |   |   |       |-- alias
|   |   |   |       `-- params
|   |   |   |-- cliBackends
|   |   |   |-- heartbeat
|   |   |   |-- compaction
|   |   |   |-- typingMode / typingIntervalSeconds
|   |   |   |-- sandbox
|   |   |   `-- memorySearch
|   |   |       |-- provider / model / fallback / enabled
|   |   |       |-- local
|   |   |       |-- remote endpoint settings
|   |   |       |-- hybrid / mmr / temporalDecay
|   |   |       |-- extraPaths
|   |   |       |-- multimodal
|   |   |       |-- embeddingCache
|   |   |       |-- batch
|   |   |       |-- sessionMemory
|   |   |       |-- store
|   |   |       `-- qmd
|   |   `-- list[]
|   |       |-- id
|   |       |-- workspace
|   |       |-- identity
|   |       |   |-- name / theme / emoji / avatar
|   |       |-- model overrides
|   |       |-- bindings
|   |       |-- groupChat
|   |       |-- heartbeat overrides
|   |       `-- memorySearch overrides
|   |
|   |-- channels
|   |   |-- defaults
|   |   |   |-- dmPolicy
|   |   |   |-- groupPolicy
|   |   |   `-- heartbeat
|   |   `-- <provider>
|   |       |-- enabled
|   |       |-- defaultAccount
|   |       |-- accounts.<id>
|   |       |-- dmPolicy / groupPolicy
|   |       |-- allowFrom / groupAllowFrom
|   |       |-- historyLimit
|   |       |-- requireMention
|   |       |-- configWrites
|   |       `-- provider-specific auth and transport fields
|   |
|   |-- messages
|   |   |-- responsePrefix
|   |   |-- ackReaction / ackReactionScope / removeAckAfterReply
|   |   |-- queue
|   |   `-- inbound
|   |
|   |-- session
|   |   |-- scope / dmScope
|   |   |-- identityLinks
|   |   |-- reset
|   |   |-- resetByType
|   |   |-- resetTriggers
|   |   |-- store
|   |   |-- maintenance
|   |   |-- threadBindings
|   |   `-- sendPolicy
|   |
|   |-- tools
|   |   |-- profile
|   |   |-- allow / deny
|   |   |-- byProvider
|   |   |-- elevated
|   |   |-- web
|   |   |   |-- search
|   |   |   `-- fetch
|   |   |-- media
|   |   |-- agentToAgent
|   |   |-- sessions
|   |   `-- sessions_spawn
|   |
|   |-- models
|   |   |-- mode
|   |   |-- providers.<provider>
|   |   |   |-- api
|   |   |   |-- apiKey
|   |   |   |-- auth
|   |   |   |-- authHeader
|   |   |   |-- baseUrl
|   |   |   |-- headers
|   |   |   `-- models
|   |   `-- bedrockDiscovery
|   |
|   |-- gateway
|   |   |-- mode / bind / port
|   |   |-- auth
|   |   |   |-- mode
|   |   |   |-- token / password
|   |   |   |-- allowTailscale
|   |   |   `-- rateLimit
|   |   |-- remote
|   |   |-- trustedProxies
|   |   |-- controlUi
|   |   `-- push.apns.relay
|   |
|   |-- browser
|   |   |-- enabled / evaluateEnabled
|   |   |-- defaultProfile
|   |   |-- ssrfPolicy
|   |   `-- profiles.<name>
|   |
|   |-- plugins
|   |   |-- load.paths
|   |   |-- allow / deny
|   |   |-- entries.<id>
|   |   |   |-- enabled
|   |   |   |-- apiKey
|   |   |   |-- env
|   |   |   |-- config
|   |   |   |-- hooks.allowPromptInjection
|   |   |   `-- subagent
|   |   `-- installs
|   |
|   |-- hooks
|   |   |-- enabled
|   |   |-- token
|   |   |-- path
|   |   |-- maxBodyBytes
|   |   |-- defaultSessionKey
|   |   |-- allowRequestSessionKey
|   |   |-- allowedSessionKeyPrefixes
|   |   |-- allowedAgentIds
|   |   |-- presets
|   |   |-- transformsDir
|   |   `-- mappings[]
|   |
|   |-- secrets
|   |   |-- providers.<id>
|   |   |   |-- source: env | file | exec
|   |   |   `-- resolver-specific settings
|   |   `-- defaults
|   |
|   |-- discovery
|   |   |-- mdns
|   |   `-- wideArea
|   |
|   |-- canvasHost
|   |   |-- root
|   |   `-- liveReload
|   |
|   |-- logging
|   |   |-- level
|   |   |-- file
|   |   |-- consoleLevel
|   |   |-- consoleStyle
|   |   |-- redactSensitive
|   |   `-- redactPatterns[]
|   |
|   |-- cron
|   |   |-- enabled
|   |   |-- webhookToken
|   |   |-- webhook
|   |   |-- sessionRetention
|   |   `-- runLog
|   |
|   |-- auth
|   |   |-- profiles
|   |   `-- order
|   |
|   |-- cli
|   |   `-- banner.taglineMode
|   |
|   |-- wizard
|   |   |-- lastRunAt
|   |   |-- lastRunVersion
|   |   |-- lastRunCommit
|   |   |-- lastRunCommand
|   |   `-- lastRunMode
|   |
|   `-- $include
|
|-- auth-profiles.json
|   `-- provider auth profiles with keyRef / tokenRef support
|
|-- credentials/
|   `-- channel-specific durable credentials such as whatsapp auth state
|
`-- agents/
    `-- <agentId>/
        |-- workspace/
        |-- sessions/
        |-- auth-profiles.json
        `-- qmd/ or memory-side state
```

## Notable configurable object families

These are the roots ChillClaw is most likely to read, write, or mirror through the adapter.

### `agents`

- `agents.defaults` is the main default runtime template for workspaces, models, heartbeats, sandbox policy, and memory search.
- `agents.list[]` defines concrete agents and their overrides.
- `agents.defaults.models` is both a model catalog and the allowlist for `/model`.
- `agents.defaults.memorySearch` is one of the deepest config families and should be treated as its own subsystem.

### `channels`

- `channels.defaults` sets shared DM and group defaults.
- `channels.<provider>` stores provider-specific auth, allowlists, account selection, and message routing policy.
- Many providers support `accounts.<id>` for multi-account mode.
- Channels frequently carry security-sensitive values, so ChillClaw should prefer secure store backed flows rather than plaintext config writes where possible.

### `session`

- Session grouping, reset rules, store location, retention, thread binding behavior, and send policy live here.
- This is a key area for product parity because session semantics should stay daemon-owned rather than forked by client.

### `tools`

- `tools.profile`, `tools.allow`, and `tools.deny` define the base tool surface.
- `tools.byProvider` can narrow capabilities by provider or model.
- `tools.elevated` controls host-level execution policy.
- `tools.web` and `tools.media` govern web search, fetch, and inbound media understanding behavior.

### `models`

- `models.providers.*` defines upstream API providers, credentials, base URLs, headers, and custom model catalogs.
- Auth resolution blends config, env vars, and `auth-profiles.json`, so ChillClaw should treat this as config plus secret state rather than a single flat JSON object.

### `gateway`

- Gateway bind mode, auth mode, trusted proxy behavior, remote connection settings, and relay integration live here.
- Non-loopback access requires deliberate auth configuration.
- ChillClaw should keep normal packaged behavior on a safe local baseline instead of exposing raw remote gateway complexity by default.

### `plugins`, `hooks`, and `cron`

- `plugins.entries.<id>` is the main per-plugin config surface.
- `hooks` exposes inbound webhook-to-agent routing behavior.
- `cron` controls scheduled jobs, delivery, retention, and webhook notification behavior.

### `secrets`

- `secrets.providers.<id>` defines env, file, or exec-backed secret resolvers.
- This is the main schema-visible hook for SecretRef-based credential indirection.

## Commands ChillClaw uses today

The sections below keep the original repo-specific reference intact. These are the upstream commands ChillClaw currently shells out to through the daemon and bootstrap scripts.

## Install, uninstall, and runtime checks

### Install

ChillClaw installs the latest OpenClaw by default.

System install:

```bash
npm install --global openclaw@latest
```

Managed-local install:

```bash
npm install --prefix <installDir> openclaw@latest
```

Version override for diagnostics or compatibility testing:

```bash
npm install --global openclaw@<overrideVersion>
npm install --prefix <installDir> openclaw@<overrideVersion>
```

### Uninstall

System uninstall:

```bash
openclaw uninstall --all --yes --non-interactive
npm rm --global openclaw
```

Managed-local uninstall:

```bash
<managed-openclaw-bin> gateway uninstall
```

### Check runtime and health

```bash
openclaw --version
openclaw status --json
openclaw gateway status --json
openclaw update status --json
```

### Update and restart

```bash
openclaw update --json --yes --no-restart --tag latest
openclaw gateway restart
```

### Repair and recovery

```bash
openclaw doctor --repair --non-interactive --yes
openclaw gateway install --force
openclaw gateway restart
```

## Model configuration

### Read current models

Configured and runtime models:

```bash
openclaw models list --json
```

Full provider catalog for model pickers:

```bash
openclaw models list --all --json
```

Model, default, and auth status:

```bash
openclaw models status --json
```

### Set default model

```bash
openclaw models set <modelKey>
```

### Authenticate providers

Paste API key or token:

```bash
openclaw models auth paste-token --provider <provider> --profile-id <profileId>
```

Interactive token setup:

```bash
openclaw models auth setup-token --provider <provider> --yes
```

OAuth login:

```bash
openclaw models auth login --provider <provider>
openclaw models auth login --provider <provider> --method <methodId>
```

GitHub Copilot:

```bash
openclaw models auth login-github-copilot --yes
```

Some legacy provider paths still use onboarding-style auth:

```bash
openclaw onboard --non-interactive --accept-risk --flow quickstart --mode local --skip-channels --skip-search --skip-skills --skip-ui --skip-health --skip-daemon --auth-choice <choice> ...
```

## Channel configuration

### Read channels

Configured channels:

```bash
openclaw channels list --json
```

Live and probed channel status:

```bash
openclaw channels status --json --probe
```

### Telegram

Add or update:

```bash
openclaw channels add --channel telegram --token <token>
openclaw channels add --channel telegram --token <token> --name <name>
```

Remove:

```bash
openclaw channels remove --channel telegram --account default --delete
```

### WhatsApp

Prepare channel:

```bash
openclaw channels add --channel whatsapp --name "ChillClaw WhatsApp"
```

Login flow:

```bash
openclaw channels login --channel whatsapp --verbose
```

Logout and remove:

```bash
openclaw channels logout --channel whatsapp --account default
openclaw channels remove --channel whatsapp --account default --delete
```

### Pairing approval

```bash
openclaw pairing approve <channelId> <code> --notify
```

### Feishu

Inspect and install plugin:

```bash
openclaw plugins list --json
openclaw plugins install @openclaw/feishu
openclaw plugins enable feishu
```

Save config:

```bash
openclaw config set --strict-json channels.feishu <json>
```

Remove config:

```bash
openclaw config unset channels.feishu
```

### WeChat Work (WeCom)

Install and enable the managed plugin:

```bash
openclaw plugins install @wecom/wecom-openclaw-plugin
openclaw plugins enable wecom-openclaw-plugin
```

Save config:

```bash
openclaw config set --strict-json channels.wecom <json>
```

Remove config:

```bash
openclaw config unset channels.wecom
```

ChillClaw also repairs legacy `wecom-openclaw-plugin` channel keys when it finds older runtime state, so both the canonical `wecom` key and the legacy plugin-shaped key may appear in migration/debug logs.

### Personal WeChat

Start login using the runtime-resolved personal WeChat channel key:

```bash
openclaw channels login --channel <wechatRuntimeChannel> --verbose
openclaw pairing approve wechat <code> --notify
```

Remove config:

```bash
openclaw channels remove --channel <wechatRuntimeChannel> --account default --delete
```

### Gateway restart after channel changes

ChillClaw restarts the gateway after most channel mutations:

```bash
openclaw gateway restart
```

## AI members and agent configuration

### Read agents

```bash
openclaw agents list --json --bindings
openclaw agents bindings --agent <agentId> --json
```

### Create or update an AI member agent

Create:

```bash
openclaw agents add <agentId> --agent-dir <agentDir> --workspace <workspaceDir> --model <modelKey> --non-interactive --json
```

Set identity:

```bash
openclaw agents set-identity --agent <agentId> --name <name> --emoji <emoji> --json
openclaw agents set-identity --agent <agentId> --name <name> --emoji <emoji> --theme <theme> --json
openclaw agents set-identity --agent <agentId> --name <name> --emoji <emoji> --avatar <preset> --json
```

Reindex memory after workspace updates:

```bash
openclaw memory index --agent <agentId> --force
```

### Bind and unbind channels

```bash
openclaw agents bind --agent <agentId> --bind <binding> --json
openclaw agents unbind --agent <agentId> --bind <binding> --json
```

### Delete AI member agent

```bash
openclaw agents delete <agentId> --force --json
```

### Run a task with a specific agent

```bash
openclaw agent --local --json --agent <agentId> --message <prompt>
```

## Chat and gateway RPC

ChillClaw chat does not shell out to `openclaw chat ...`. It uses gateway RPC calls through the daemon bridge.

Gateway RPC methods in use:

```bash
openclaw gateway call chat.history --json --params <json> --timeout 20000
openclaw gateway call chat.send --json --params <json> --timeout 30000
openclaw gateway call chat.abort --json --params <json> --timeout 15000
```

## Notes

- ChillClaw echoes external commands to the console in development mode so install, update, repair, and setup behavior is visible.
- ChillClaw may wrap these commands with managed-local paths, environment overrides, cache invalidation, and gateway restart or health verification.
- This file is a developer and operator reference, not a user guide. The product should continue to expose these through the UI instead of requiring terminal use.
