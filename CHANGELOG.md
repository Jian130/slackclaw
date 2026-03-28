# Changelog

## Unreleased

### 2026-03-29 02:04 CST

- clarified ChillClaw onboarding docs and README around the current seven-step flow versus the target six-step contract, with updated design references and product naming cleanup
- improved web and native onboarding channel setup by polling active sessions, auto-advancing personal WeChat when refreshed config shows completion, sanitizing native session logs, and surfacing clearer QR-code wait states
- normalized OpenClaw runtime channel handling for WeCom and personal WeChat, enabled WeChat Work pairing approval, and moved the personal WeChat helper path to a managed local `npm install` plus `weixin-installer` runtime
- changed onboarding preset-skill reconciliation to return pending state immediately while the daemon finishes sync in the background, with matching event-driven UI refreshes and expanded regression coverage

### 2026-03-28 21:38 CST

- added daemon-managed OpenClaw plugin lifecycle support with a dedicated Plugins surface, retained plugin-config events, automatic WeCom plugin install and update, and removal blocking when active features still depend on a managed plugin
- split the old `wechat` integration into distinct `wechat-work` and `wechat` setup paths, renamed the existing flow to **WeChat Work (WeCom)**, aligned WeCom config with the upstream `channels.wecom.*` contract, and moved personal WeChat onto a QR-first external installer workflow
- changed onboarding so model and channel saves advance immediately from authoritative mutation results, added explicit onboarding runtime finalization that installs or starts the gateway service before setup completes, and fixed stale draft reconciliation that could block AI employee creation after successful model setup
- reduced daemon polling and event feedback loops by stopping snapshot GET routes from re-emitting update events, scoping preset-skill refreshes to real runtime changes, and adding ISO timestamps to daemon console output and logs for easier live debugging
- polished the native macOS onboarding UX with centered loading hero cards, improved scaffold centering, clearer completion actions, button loading states, and WeChat Work save behavior that defers gateway restart until config is ready
- stabilized native and shared chat flows by making initial history loads non-blocking, ignoring duplicate startup requests, reusing cached thread detail on send, and fixing a Swift exclusivity conflict in selected-thread event application that could freeze the macOS app after sending a message

### 2026-03-27 00:51 CST

- refactored the macOS and React clients around shared UI primitives and approved page scaffolds so dashboard, deploy, settings, onboarding, chat, team, members, skills, and configuration now reuse the same design-system contract
- added a native shared UI layer under `apps/macos-native/Sources/SlackClawNative/UI` and migrated the native shell, onboarding, permissions, and main product screens onto shared surfaces, badges, buttons, metrics, and scaffold layouts
- added shared React `StatusBadge` and scaffold components, removed the broken `StatusPill` path, and moved the shared web styling layer to semantic token-driven variants instead of page-local status and scaffold drift
- added shared UI contract coverage for native badge/scaffold semantics and React status rendering, and normalized touched product-facing UI copy to `ChillClaw`
- documented shared UI reuse rules in `AGENTS.md` and now require timestamped changelog updates for future changelog entries

### Native macOS client

- added a new daemon-backed native macOS client under `apps/macos-native`
- added `apps/shared/SlackClawKit` with shared Swift protocol, daemon client, and chat UI packages
- changed the macOS installer build so the packaged app launches the native SwiftUI client by default while still bundling the React UI as an explicit fallback
- added `npm run build:mac-native` and `npm run test:mac-native` for native-client development
- added the same daemon-backed seven-step onboarding flow to the native macOS client, including first-run gating, draft resume, settled install/permissions/model/channel/employee mutations, and native onboarding avatar resources
- aligned onboarding step 1 in both React and native clients to the shared macOS welcome-screen design baseline, including a responsive `70%` content canvas, a flatter welcome-card height on normal desktop windows, native window defaults, system-font typography, and an onboarding-wide language selector
- rebuilt onboarding step 2 in both React and native clients to the single-card Figma install flow, including the slim shared header/progress row, missing/installing/found/complete states, daemon-backed install progress, version badge, and explicit next-step confirmation instead of auto-advancing past install
- added a reusable native macOS permissions surface for onboarding and Settings, covering Automation, Notifications, Accessibility, Screen Recording, Microphone, Speech Recognition, Camera, and Location with live status refresh and localized copy
- moved the native locale picker into the lower-left sidebar footer, localized the dashboard/sidebar shell strings in English, Chinese, Japanese, Korean, and Spanish, and aligned dashboard metric cards to a shared row height
- added reusable configured-channel approve-pairing actions to the native Configuration screen so pairing-capable channels can reopen the same channel sheet for code approval

### Engine architecture

- refactored the engine seam into a composed four-manager facade:
  - `instances` for install, uninstall, update, and runtime detection
  - `config` for staged model, channel, skill, workspace, and tool configuration
  - `aiEmployees` for OpenClaw agent-backed AI employee config and per-agent workspaces
  - `gateway` for live gateway lifecycle, health, chat, pairing, and apply/restart flows
- changed daemon services and routes to delegate through the composed manager boundary while keeping the existing HTTP route surface stable
- added pending gateway-apply signals so SlackClaw can distinguish staged config from live/applied runtime state
- added the first hybrid daemon event-bus foundation:
  - shared `SlackClawEvent` contracts in TypeScript and Swift
  - one client-facing daemon WebSocket endpoint at `/api/events`
  - browser and native client event-stream primitives for incremental adoption
  - first live event publishing for first-run install/setup, deploy actions, gateway restart, and chat stream mirroring
- extracted the first explicit daemon-side filesystem/state adapter and routed state persistence plus operational log writes through it instead of direct scattered `fs/promises` calls
- extended daemon event publication into config-facing services so channel, skill, and AI-employee mutations now emit `config.applied`, and interactive channel flows emit `channel.session.updated`
- wired the React overview provider to the daemon event bus so deploy, gateway, and config events trigger fresh overview reads automatically
- extracted an explicit daemon-side secrets adapter seam, added a safe macOS keychain implementation, and wired channel/model secret mirroring through that boundary instead of leaving raw secrets as implicit request plumbing
- extracted explicit daemon-side CLI runner and OpenClaw gateway-socket adapter seams so the core service no longer keeps those mechanics embedded as one-off logic inside `openclaw-adapter.ts`
- wired the React Deploy page to the daemon event bus so deploy completion and gateway-status pushes now refresh target state automatically, while external deploy-progress events can drive the visible activity panel
- wired the React AI Team provider and the native macOS app state to the daemon event bus so config changes now refresh live member/team state without waiting for a manual page reload
- wired the React onboarding and chat surfaces to the daemon event bus so setup progress and live chat updates now flow through the shared WebSocket event channel instead of page-specific polling and chat-only SSE
- moved task execution onto the composed `gateway` manager so product services can stop depending on the old flat `adapter.runTask(...)` compatibility method
- changed the shared Swift client so native chat derives its live transcript stream from daemon `chat.stream` events instead of opening a second `/api/chat/events` transport
- wired the native onboarding view model to the shared daemon event bus so install, model, channel, and AI-employee steps refresh the right authoritative resource when matching daemon events arrive
- removed the remaining public flat behavior bag from the `EngineAdapter` interface, leaving the composed managers as the typed product-facing seam while concrete adapters keep extra helper methods only as implementation details
- removed the old daemon-side `/api/chat/events` SSE route and subscriber plumbing now that both web and native chat consume the shared `/api/events` WebSocket bus
- moved concrete adapter tests onto the composed manager seam and rewired concrete OpenClaw/mock managers with explicit access objects so concrete-only helper methods can keep shrinking behind the managers instead of acting like a second public API

### Deploy and runtime management

- added deploy target detection for installed and installable OpenClaw runtimes
- added install, update, and uninstall flows for the current OpenClaw targets
- added current/latest version display and in-card update actions on the Deploy page
- added deploy/update progress tracking in the UI
- changed OpenClaw install and bootstrap flows to target the latest available release by default instead of a hardcoded base version
- changed install/deploy summaries and install metadata to describe latest-version reuse/install behavior instead of a pinned-version floor
- changed install/reuse to normalize inherited OpenClaw gateway config back to SlackClaw's local baseline so a stale remote gateway override cannot silently poison first-run health checks

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
- added reusable approve-pairing actions for configured channels in the React Configuration page and fixed the dialog so successful pairing approval closes cleanly instead of leaving the modal open

### AI members and teams

- added real daemon-backed AI member and AI team management
- map each SlackClaw AI member to one OpenClaw agent with live detection of existing agents
- added member create, edit, remove, bind, and retention-aware delete flows
- generate richer per-agent workspaces with identity, soul, user, brain, tools, memory, bootstrap, knowledge, and skill files
- switched new member agent ids to readable `name + datetime` identifiers
- added daemon-owned AI member presets to shared contracts, service responses, onboarding, and the native member creation flow so curated starter roles and avatar presets stay aligned across clients

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
- removed the non-runnable root Xcode workspace stub and restored `apps/macos-native/Package.swift` as the direct Xcode entry point for native development

### UI polish

- moved the language selector into the bottom-left sidebar under the status card
- hid inactive saved-model records from the main Configuration models view whenever live runtime models already exist, so the page stays closer to `openclaw models list`
- replaced the old intro/check onboarding with a daemon-backed seven-step onboarding flow for welcome, install, permissions, model, channel, AI employee, and completion
- added daemon-persisted onboarding draft state and completion summary routes so onboarding progress survives refreshes
- added onboarding avatar presets and shared avatar rendering so the new preset images also render in members, team, dashboard, and chat surfaces
- changed onboarding step 4 to use a daemon-owned curated provider config so React and native now guide users through the same three-provider model setup path instead of exposing the full runtime provider catalog during onboarding
- changed onboarding step 4 curated-provider metadata to use `platformUrl` and optional `tutorialVideoUrl`, and wired MiniMax tutorial playback into in-app web/native modal flows instead of opening an external link
- changed onboarding step 5 to use the same daemon-owned config pattern for curated channels, so React and native now guide users through WeChat Work, Feishu, and Telegram setup from one shared source of truth
- added a daemon-backed `Redo onboarding` action so web and native Settings can restart the guided setup without wiping the existing workspace
- rebuilt onboarding steps 1 through 6 to match the current Figma/React flow more closely across both the web app and the native macOS app, including curated provider/channel selection, guided setup cards, tighter responsive layout rules, and config-driven tutorial/platform links
- replaced the onboarding step 6 personality editor with curated employee presets and wired the new portrait avatar assets into both the web and native onboarding flows
- inserted a shared onboarding permissions step after install in both web and native clients, with step metadata, copy, and draft progression owned by shared contracts and daemon state
- refreshed the native macOS shell to use the lighter branded sidebar/status layout instead of the older dark developer-style chrome, so dashboard and deploy now sit much closer to the React/Figma product design
- rebuilt the native macOS Deploy page around the React/Figma hierarchy with the one-click deployment hero, grouped variant cards, badges, feature lists, requirements, and summary cards
- changed the native macOS client to gate startup on overview first and lazily load the active section afterward, avoiding cold-start failures caused by blasting every `fresh=1` page endpoint at once
- fixed managed-local first-run installs so SlackClaw re-detects the freshly installed OpenClaw CLI before verifying it, instead of failing against a stale cached “not installed” result
- extended native macOS client timeouts for long-running setup and deploy/install requests so real OpenClaw installs are less likely to fail with `The request timed out.`
