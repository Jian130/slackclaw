# Changelog

## Unreleased

### Native macOS client

- added a new daemon-backed native macOS client under `apps/macos-native`
- added `apps/shared/SlackClawKit` with shared Swift protocol, daemon client, and chat UI packages
- changed the macOS installer build so the packaged app launches the native SwiftUI client by default while still bundling the React UI as an explicit fallback
- added `npm run build:mac-native` and `npm run test:mac-native` for native-client development
- added the same daemon-backed six-step onboarding flow to the native macOS client, including first-run gating, draft resume, settled install/model/channel/employee mutations, and native onboarding avatar resources

### Engine architecture

- refactored the engine seam into a composed four-manager facade:
  - `instances` for install, uninstall, update, and runtime detection
  - `config` for staged model, channel, skill, workspace, and tool configuration
  - `aiEmployees` for OpenClaw agent-backed AI employee config and per-agent workspaces
  - `gateway` for live gateway lifecycle, health, chat, pairing, and apply/restart flows
- changed daemon services and routes to delegate through the composed manager boundary while keeping the existing HTTP route surface stable
- added pending gateway-apply signals so SlackClaw can distinguish staged config from live/applied runtime state

### Deploy and runtime management

- added deploy target detection for installed and installable OpenClaw runtimes
- added install, update, and uninstall flows for the current OpenClaw targets
- added current/latest version display and in-card update actions on the Deploy page
- added deploy/update progress tracking in the UI
- changed OpenClaw install and bootstrap flows to target the latest available release by default instead of a hardcoded base version
- changed install/deploy summaries and install metadata to describe latest-version reuse/install behavior instead of a pinned-version floor

### Model management

- replaced provider-only configuration with saved model entries
- added create and edit flows for saved model entries
- added default and fallback role management for saved entries
- changed normal saved entries so they stay as SlackClaw metadata until promoted into the runtime chain
- aligned model auth/setup commands with the current OpenClaw CLI `models auth` surface instead of relying on onboarding flows for single-secret provider auth
- added config-backed fallback recovery for safe model-chain mutations such as setting the default model when the OpenClaw CLI command shape drifts
- reconciled SlackClaw saved entries against the live OpenClaw runtime model chain so the UI reflects `openclaw models list --json`
- cleaned the Models page so it primarily shows configured models and runtime-detected models instead of exposing a separate saved-entry concept in the main UI
- clear stale configured-model state when the live OpenClaw runtime is clean or uninstalled, so a fresh install starts with an empty Models page

### Channel and gateway behavior

- stage runtime-affecting model, channel, skill, and AI-employee changes without restarting the gateway during save
- reserve gateway restart and live verification for gateway-manager actions such as restart/apply, login, pairing, and chat runtime use
- improved Telegram, WhatsApp, Feishu, and WeChat setup flows and recovery messaging
- added config-backed fallback recovery for known OpenClaw CLI drift on safe channel mutations such as Telegram, Feishu, and WeChat config writes and removals
- restored the Feishu setup guide in-product with direct links to the official OpenClaw and platform docs
- changed channel management to detect and show existing live OpenClaw channel accounts in addition to SlackClaw-managed entries

### AI members and teams

- added real daemon-backed AI member and AI team management
- map each SlackClaw AI member to one OpenClaw agent with live detection of existing agents
- added member create, edit, remove, bind, and retention-aware delete flows
- generate richer per-agent workspaces with identity, soul, user, brain, tools, memory, bootstrap, knowledge, and skill files
- switched new member agent ids to readable `name + datetime` identifiers

### Skills

- replaced the demo Skills page with a live installed-skill manager backed by OpenClaw
- added ClawHub explore, search, inspect, install, update, and remove flows
- added SlackClaw-managed custom skill create and edit flows
- changed AI member skill selection to use the shared live runtime skill library

### Chat

- replaced the placeholder `/chat` route with a real multi-thread AI member chat workspace
- added daemon-owned OpenClaw gateway chat/session bridging with SSE updates to the UI
- added Telegram-style chat UX with optimistic user messages, thinking indicators, stop/retry actions, unread state, and thread switching
- fixed chat duplication issues around optimistic user messages, internal tool-result payloads, and multi-step assistant replies
- improved chat recovery so authentication failures and history reload issues surface clearly instead of leaving threads stuck in thinking

### Runtime performance and reliability

- reduced duplicate OpenClaw CLI reads with adapter-level command resolution caching and short-lived snapshot caches
- removed known channel, skill, model, overview, and AI member N+1 read patterns
- added frontend GET dedupe and route-scoped providers to cut duplicate page-load requests
- tightened daemon error logging and dev-process cleanup for `npm start` and `npm stop`
- added shared loading blockers and button-level loading spinners across the main UI so blocked actions always show visible progress
- sped up the Configuration page by caching read requests and lazily loading Channels instead of blocking Models on both tabs at once
- fixed the dashboard connected-model metric so it reads the live model configuration instead of unrelated install-check placeholders

### Compatibility and tests

- added an engine compatibility manifest and developer compatibility runner for evaluating new OpenClaw versions
- added fixture-based compatibility parsing tests for OpenClaw CLI output
- expanded co-located tests for adapter, service, contract, and UI behavior around deploy, config, AI member, skill, and chat flows

### Developer experience

- added development-mode logging for executed OpenClaw commands from the daemon
- changed the mac installer build to stage the `.app` bundle outside `dist/macos`, so a stale root-owned app bundle no longer blocks `npm run build:mac-installer`
- clarified packaged-app detection and cleanup behavior around SlackClaw-managed runtimes stored under `~/Library/Application Support/SlackClaw`
- changed `npm start` so local dev startup no longer auto-runs OpenClaw bootstrap or installation; use the in-product install flow or `npm run bootstrap:openclaw` when you want to install it explicitly
- expanded development-mode command logging so daemon-side `npm`, `brew`, `launchctl`, helper shell commands, and bootstrap commands are echoed to the console, not just `openclaw`
- added `npm restart` as the one-command managed dev restart path on top of the existing `npm stop` and `npm start` scripts
- added a root `SlackClaw.xcworkspace` so Xcode can open the native macOS app and shared Swift packages together while keeping React and future native apps parallel in the repo layout

### UI polish

- moved the language selector into the bottom-left sidebar under the status card
- hid inactive saved-model records from the main Configuration models view whenever live runtime models already exist, so the page stays closer to `openclaw models list`
- replaced the old intro/check onboarding with a daemon-backed six-step onboarding flow for welcome, install, model, channel, AI employee, and completion
- added daemon-persisted onboarding draft state and completion summary routes so onboarding progress survives refreshes
- added onboarding avatar presets and shared avatar rendering so the new preset images also render in members, team, dashboard, and chat surfaces
- changed the native macOS client to gate startup on overview first and lazily load the active section afterward, avoiding cold-start failures caused by blasting every `fresh=1` page endpoint at once
- fixed managed-local first-run installs so SlackClaw re-detects the freshly installed OpenClaw CLI before verifying it, instead of failing against a stale cached “not installed” result
- extended native macOS client timeouts for long-running setup and deploy/install requests so real OpenClaw installs are less likely to fail with `The request timed out.`
