# OpenClaw Command Reference

This document lists the upstream OpenClaw commands SlackClaw uses today.

Primary sources:
- [openclaw-adapter.ts](/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/openclaw-adapter.ts)
- [bootstrap-openclaw.mjs](/Users/home/Ryo/Projects/slackclaw/scripts/bootstrap-openclaw.mjs)

SlackClaw runs these through the daemon and bootstrap scripts. The frontend does not call OpenClaw directly.

## Install, uninstall, and runtime checks

### Install

SlackClaw installs the latest OpenClaw by default.

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

Configured/runtime models:

```bash
openclaw models list --json
```

Full provider catalog for model pickers:

```bash
openclaw models list --all --json
```

Model/default/auth status:

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

Live/probed channel status:

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
openclaw channels add --channel whatsapp --name "SlackClaw WhatsApp"
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

Inspect/install plugin:

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

### WeChat workaround

Install/enable plugin:

```bash
openclaw plugins install <pluginSpec>
openclaw plugins enable <pluginId>
```

Save config:

```bash
openclaw config set --strict-json channels.<pluginId> <json>
```

Remove config:

```bash
openclaw config unset channels.<pluginId>
```

### Gateway restart after channel changes

SlackClaw restarts the gateway after most channel mutations:

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

SlackClaw chat does not shell out to `openclaw chat ...`. It uses gateway RPC calls through the daemon bridge.

Gateway RPC methods in use:

```bash
openclaw gateway call chat.history --json --params <json> --timeout 20000
openclaw gateway call chat.send --json --params <json> --timeout 30000
openclaw gateway call chat.abort --json --params <json> --timeout 15000
```

## Notes

- SlackClaw echoes external commands to the console in development mode so install, update, repair, and setup behavior is visible.
- SlackClaw may wrap these commands with managed-local paths, environment overrides, cache invalidation, and gateway restart/health verification.
- This file is a command reference, not a user guide. The product should continue to expose these through the UI instead of requiring terminal use.
