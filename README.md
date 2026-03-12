# SlackClaw

SlackClaw is a macOS-first, local-first desktop product that makes OpenClaw usable for non-technical users. This repository currently contains:

- a React + TypeScript desktop UI for deploy, configuration, task routing, health, and recovery
- a local TypeScript daemon with an engine adapter seam
- an `OpenClawAdapter` implementation that manages deploy targets, model entries, channels, updates, and gateway health
- shared contracts for deployment, model/channel management, onboarding, task execution, recovery, and updates

## Workspace layout

- `apps/desktop-ui`: React UI for install, onboarding, tasks, health, and recovery
- `apps/daemon`: local API and orchestration layer
- `packages/contracts`: shared domain types and defaults
- `docs/adr`: architecture decisions for v0.1

## Current state

This is an active MVP implementation, not a blank scaffold. It intentionally keeps the engine abstraction narrow and the first-party UX opinionated.

The desktop shell is implemented as a web UI + local daemon boundary so a Tauri wrapper can be added once the Rust toolchain is available in the target environment.

## What Works Today

- Deploy page:
  - detects installed OpenClaw runtimes on the current Mac
  - separates installed targets from installable targets
  - supports install, update, and uninstall flows for the current OpenClaw targets
  - shows current and latest version information
- Configuration page:
  - shows the live OpenClaw runtime model chain and a separate SlackClaw saved-entry list
  - supports saved model entry add/edit flows
  - supports default and fallback model selection
  - restarts the OpenClaw gateway and verifies health after runtime-affecting config changes
- Channel setup:
  - supports Telegram, WhatsApp, Feishu, and a WeChat workaround path
  - keeps onboarding gating in place before channels are unlocked
- Developer workflow:
  - includes an engine compatibility test runner for evaluating future OpenClaw versions
  - includes co-located tests for compatibility-sensitive adapter, service, contract, and UI logic

## System structure

```mermaid
flowchart LR
    User["User"] --> App["SlackClaw.app"]
    App --> Launcher["macOS launcher script"]
    Launcher --> LaunchAgent["SlackClaw LaunchAgent"]
    LaunchAgent --> Daemon["SlackClaw daemon<br/>Node.js HTTP API"]
    App --> Browser["Local UI<br/>React + TypeScript"]
    Browser -->|HTTP /api + static UI| Daemon
    Daemon --> Contracts["Shared contracts<br/>@slackclaw/contracts"]
    Daemon --> Adapter["Engine adapter layer"]
    Adapter --> OpenClaw["OpenClawAdapter"]
    Adapter -. future .-> Future["ZeroClaw / IronClaw adapters"]
    Adapter -. future .-> LocalLLM["Local LLM runtime adapters<br/>Qwen / MiniMax-style / custom"]
    OpenClaw --> CLI["openclaw CLI"]
    CLI --> Gateway["OpenClaw gateway/service"]
    CLI --> Config["OpenClaw config + health + doctor"]
    LocalLLM --> LocalRuntime["Ollama / vLLM / LM Studio / local gateway"]
    Daemon --> Data["SlackClaw local data<br/>~/Library/Application Support/SlackClaw"]
    App --> Pkg["SlackClaw-macOS.pkg"]
```

### Runtime breakdown

- `SlackClaw.app` is a lightweight launcher that ensures the SlackClaw LaunchAgent is installed, then opens the UI.
- In the packaged app, the daemon is intended to run under a per-user macOS `LaunchAgent` instead of a one-off background shell process.
- The daemon serves both the `/api` endpoints and the built frontend assets when packaged.
- The engine seam lives behind `EngineAdapter`, so SlackClaw product logic does not talk to OpenClaw directly.
- `OpenClawAdapter` checks for an existing pinned OpenClaw install, reuses it when compatible, and otherwise deploys a SlackClaw-managed local OpenClaw runtime under the user's SlackClaw data directory.
- The adapter seam is intentionally future-facing: it should later support local-LLM runtimes and model families such as Qwen, MiniMax-exposed local runtimes, Llama, Mistral, and other OpenAI-compatible local gateways.
- User state, diagnostics, and SlackClaw metadata live in `~/Library/Application Support/SlackClaw` when packaged.

### Packaging breakdown

- `SlackClaw-macOS.pkg` installs `SlackClaw.app` into `/Applications`.
- The app bundle contains the built UI, daemon, LaunchAgent helper scripts, and OpenClaw bootstrap/install logic.
- OpenClaw itself is reused when a compatible install already exists, or deployed into SlackClaw-managed local app data when setup needs to install it.

## Languages

The first-party UI currently supports:

- English
- Chinese
- Japanese
- Korean
- Spanish

Language selection is handled in the frontend and stored locally in the browser.

## Future adapter direction

SlackClaw should remain able to support more than OpenClaw.

- Keep the current `EngineAdapter` boundary as the only place where engine-specific logic is allowed.
- Future adapters may target local-LLM runtimes, including model families such as Qwen and other self-hosted stacks exposed through Ollama, vLLM, LM Studio, or compatible local gateways.
- MiniMax-style support should be added through an adapter or local gateway compatibility layer, not by hard-coding provider assumptions into the product UI.
- The product layer should continue to care about install, lifecycle, health, tasks, updates, and recovery, not about model-specific wire formats.

## Quick start

1. Install dependencies with `npm install`
2. Start the full local test stack with `npm start`
3. Stop the full local test stack with `npm stop`

The daemon defaults to `http://127.0.0.1:4545`.

### What `npm start` does

- checks that local Node dependencies already exist
- runs `npm run bootstrap:openclaw` and waits for it to finish
- builds the shared contracts and daemon before launching them
- starts the daemon and waits for port `4545` to open
- starts the UI and waits for port `4173` to open
- fails early if either expected port is already occupied
- records the managed daemon and UI process IDs in `.data/dev-processes.json`
- prints numbered, step-by-step console output so local development startup progress is visible
- keeps both processes attached to the same terminal session so `Ctrl+C` shuts them down together

### What `npm stop` does

- reads `.data/dev-processes.json`
- stops the managed SlackClaw daemon and UI process groups
- clears the tracked dev-process state file

If you still want to run pieces separately for debugging:

1. `npm run bootstrap:openclaw`
2. `npm run dev:daemon`
3. `npm run dev:ui`

## Engine compatibility workflow

SlackClaw now includes a developer-only engine compatibility runner for evaluating new OpenClaw versions before SlackClaw adopts them.

- Run the normal static checks first:
  - `npm run build`
  - `npm run test`
- Run the compatibility matrix:
  - `npm run test:engine-compat`
  - `npm run test:engine-compat -- --candidate-version 2026.3.11`
  - `npm run test:engine-compat -- --runtime managed --candidate-version 2026.3.11`

What the compatibility runner does:

- creates isolated temporary `HOME` and SlackClaw data directories so it does not reuse your normal config by default
- checks both runtime modes SlackClaw supports today:
  - an existing system OpenClaw install
  - a SlackClaw-managed self-contained runtime
- uses the same bootstrap script SlackClaw uses for managed installs
- writes a machine-readable JSON report and a Markdown summary under `.data/engine-compatibility/...`
- records capability-by-capability pass/fail/not-supported status plus the likely SlackClaw source files to update when something breaks

Notes:

- The system-runtime lane only runs against whatever `openclaw` version is already installed on your machine. If you pass `--candidate-version` and the system install is on a different version, that lane is skipped and reported clearly.
- The managed-runtime lane can bootstrap a candidate version into an isolated SlackClaw data directory by using `--candidate-version`.
- Task execution is skipped unless you set `SLACKCLAW_COMPAT_RUN_TASK=1` and provide real credentials the candidate runtime can use.
- Compatibility fixtures for parser drift live under `apps/daemon/src/engine/__fixtures__/openclaw/`.

## First-run app flow

When a user installs and opens SlackClaw for the first time:

1. SlackClaw shows an intro page once.
2. After `Get started`, SlackClaw opens a first-run setup page.
3. The setup flow checks whether OpenClaw already exists on the Mac.
4. If OpenClaw already exists, SlackClaw reuses it.
5. If OpenClaw is missing or incompatible, SlackClaw deploys the pinned OpenClaw runtime into `~/Library/Application Support/SlackClaw/data/openclaw-runtime`.
6. Once deployment is complete, SlackClaw moves the user into the normal product UI to run OpenClaw onboarding.
7. After onboarding, SlackClaw guides channel setup.
8. Only after onboarding and channel setup does SlackClaw restart the OpenClaw gateway.

The intro page is skipped on later launches. If setup was not completed, SlackClaw resumes the setup page instead of dropping the user straight into the main workspace.

## Channel onboarding

After OpenClaw is deployed and onboarding is complete, SlackClaw exposes a guided channel setup panel in the UI:

- `Telegram`: saves a bot token with `openclaw channels add --channel telegram --token ...`, then approves the first pairing code.
- `WhatsApp`: starts `openclaw channels login --channel whatsapp --verbose`, streams the session output into SlackClaw, then approves the pairing code.
- `Feishu`: prepares the official plugin when needed, saves Feishu credentials into OpenClaw, restarts the gateway, and guides pairing.
- `WeChat workaround`: installs and enables a community WeCom-style plugin path, saves the workaround config, and clearly marks this path as experimental rather than official OpenClaw support.
- `Gateway restart`: after channel setup is complete, SlackClaw restarts the OpenClaw gateway so all configured channels load together.

SlackClaw now also exposes an explicit `Deploy OpenClaw locally` action in the first-run setup page and the install panel. That path forces deployment into SlackClaw's managed local runtime instead of merely reusing a compatible system OpenClaw.
The service panel also now exposes app-level controls to stop the local SlackClaw daemon and uninstall the packaged app's managed service/data.

## Model management

SlackClaw manages AI models in two related ways:

- `Current OpenClaw runtime`: the active default + fallback model chain reported by the installed OpenClaw runtime
- `Saved model entries`: SlackClaw-managed model entries that preserve credentials and role choices for switching runtime behavior

Current behavior:

- normal saved entries stay as SlackClaw metadata until promoted to default or fallback
- runtime-affecting entries use hidden OpenClaw agents behind the scenes when needed
- if OpenClaw is changed outside SlackClaw, SlackClaw reconciles the active runtime chain back into the model overview so the UI stays truthful
- duplicate saved entries for the same model can exist, but only one copy of a model can be active in the runtime chain at a time

### Local OpenClaw deployment

- Packaged SlackClaw prefers a compatible existing `openclaw` install if one is already available.
- If no compatible install is found, SlackClaw deploys `openclaw@2026.3.7` into `~/Library/Application Support/SlackClaw/data/openclaw-runtime`.
- Once that managed runtime exists, SlackClaw prefers it over an incompatible system-level OpenClaw.
- If the user clicks `Deploy OpenClaw locally`, SlackClaw deploys the managed local runtime even when a compatible system OpenClaw already exists.
- If `npm` is missing but Homebrew is available, SlackClaw now tries to install the needed `node`/`npm` toolchain and `git` through Homebrew before retrying local OpenClaw deployment.
- If neither `npm` nor Homebrew is available, setup fails with a direct prerequisite message instead of pretending installation succeeded.
- UI install/setup errors now surface the daemon's real error message instead of only showing a generic HTTP status.

## macOS installer

Build a distributable macOS app bundle and installer package with:

`npm run build:mac-installer`

This produces:

- `dist/macos/SlackClaw.app`
- `dist/macos/SlackClaw-macOS.pkg`

The packaged app bundles the built UI and a self-contained `slackclaw-daemon` executable. On launch it starts the local SlackClaw daemon, serves the built UI on `http://127.0.0.1:4545/`, and opens the app in the default browser.
The packaged SlackClaw daemon no longer depends on a separate Homebrew-style Node runtime on the target Mac.

The packaged app also includes LaunchAgent helper scripts so SlackClaw can run as a login-time background service on macOS.
If LaunchAgent startup does not come up in time, the launcher now falls back to starting the bundled daemon directly so `http://127.0.0.1:4545/` is still reachable.
If the daemon still does not become reachable, SlackClaw opens a local troubleshooting page instead of opening the localhost URL blindly.

Packaged app logs live under:

- `~/Library/Application Support/SlackClaw/logs/daemon.log`
- `~/Library/Application Support/SlackClaw/logs/launcher.log`

## App controls

- `Stop SlackClaw` stops the local daemon and attempts to close the browser-served UI.
- `Uninstall SlackClaw` stops the daemon, removes the LaunchAgent, removes SlackClaw-managed local data, and removes the packaged app bundle when running from the packaged macOS app.
- `Remove service` only uninstalls the LaunchAgent. It does not uninstall the app or delete SlackClaw data.
