# Changelog

## Unreleased

## 0.1.7 - 2026-04-15

### 2026-04-15 16:12 CST

- added a daemon-owned Download Manager foundation with persisted queue state, deduped jobs, restart recovery, HTTP/file artifact executors, Ollama pull jobs, checksum and size validation, cancel/resume actions, retained `downloads.updated` snapshots, and live download events
- moved runtime artifact transfers and managed local-model pulls behind the Download Manager while keeping install, unpack, activation, and OpenClaw npm install behavior in the existing runtime and local-model services
- extended shared TypeScript, React client, and Swift protocol contracts with download job models, events, `downloadJobId` links, and `/api/downloads` route support for future unified Downloads surfaces
- updated daemon architecture docs to show Download Manager as the central transfer subsystem for runtime artifacts, Ollama model pulls, and future downloadable packages
- fixed daemon test discovery in GitHub Actions by replacing shell-expanded globs with a deterministic Node test-file runner, ensuring root-level and nested daemon tests run consistently on Ubuntu and adding per-file CI annotations for future daemon test failures

## 0.1.6 - 2026-04-15

### 2026-04-15 12:35 CST

- fixed long OpenClaw installs by removing the daemon's fixed request timeout, giving native install and update calls a 24-hour budget, and keeping the macOS onboarding install screen polling after recoverable client timeouts instead of showing a timeout popup while the runtime is still installing
- fixed native local-model onboarding so a stale managed Ollama entry that is not active in OpenClaw no longer skips the Ollama setup screen

### 2026-04-13 17:28 CST

- added a daemon-owned runtime manager with shared TypeScript and Swift contracts, `/api/runtime` endpoints, WebSocket runtime progress events, OpenAPI/reference docs, and runtime manifest metadata so managed artifacts can be inspected, prepared, updated, repaired, and removed through one backend path
- added macOS runtime artifact preparation and release packaging support for bundled Node.js/npm and Ollama resources, including executable validation, release workflow signing coverage, packaged LaunchAgent runtime environment wiring, and runtime artifact documentation
- hardened clean macOS OpenClaw installation by requiring the ChillClaw-managed Node.js, npm, and packaged runtime artifacts to be executable, falling back from a broken bundled Node/npm runtime to the archive download path, and preserving the managed OpenClaw install boundary under ChillClaw app data
- improved onboarding step 2 feedback across the React and native macOS clients by mapping Node/npm and OpenClaw runtime-manager progress events into the install progress indicator so users see install-stage movement while ChillClaw prepares the managed runtime

## 0.1.5 - 2026-04-12

### 2026-04-12 23:04 CST

- fixed the daemon GitHub Actions suite on Linux by making macOS managed-runtime install fixtures explicitly exercise the Darwin runtime path while preserving the production non-macOS install guard
- bumped ChillClaw package metadata and internal workspace dependency pins to 0.1.5 for the next tagged macOS release

## 0.1.4 - 2026-04-12

### 2026-04-12 22:24 CST

- fixed clean macOS OpenClaw installation by downloading a ChillClaw-managed Node.js/npm runtime into app data for managed installs, so setup no longer requires Homebrew or a user-installed npm before the Ollama step

### 2026-04-12 22:05 CST

- fixed clean macOS daemon startup when the first localhost ping is refused, so the native app treats that as a missing daemon and installs the LaunchAgent instead of failing before launchd is registered

### 2026-04-12 21:42 CST

- fixed clean macOS app startup so the native client creates `~/Library/Application Support/ChillClaw` before daemon reachability checks, uses a short pre-launch ping timeout, and gives launchd enough time for the packaged daemon to become reachable

### 2026-04-12 20:52 CST

- fixed a native macOS startup crash in signed app builds by replacing SwiftPM `Bundle.module` startup resource lookups with a packaged-app-safe resolver for `Contents/Resources` and copied Swift resource bundles

### 2026-04-12 20:40 CST

- fixed signed macOS releases by signing the packaged Node daemon with the hardened-runtime entitlements it needs for V8 executable memory, and by signing the outer app without overwriting the daemon signature so clean Macs no longer kill the daemon at startup

### 2026-04-12 20:00 CST

- fixed the macOS release workflow by deferring Gatekeeper assessment until after the signed DMG is notarized and stapled, avoiding the pre-notarization `Unnotarized Developer ID` rejection

### 2026-04-12 19:34 CST

- pointed the tag-driven macOS release workflow at the GitHub `macos-app` environment so Developer ID signing and notarization secrets can be managed from the environment the repo now uses for app releases

### 2026-04-12 18:08 CST

- clarified the macOS installer flow by warning that local `npm run build:mac-installer` DMGs are same-machine smoke artifacts, updating README release guidance to use the signed and notarized GitHub release DMG on other Macs, and adding release-script coverage so the local-distribution warning stays in place

### 2026-04-12 17:40 CST

- split GitHub Actions JavaScript test validation by workspace package and added matching root package scripts, so CI identifies whether contracts, daemon, desktop UI, website, or release-script coverage failed without relying on unavailable combined logs

### 2026-04-12 17:30 CST

- hardened the daemon CI suite by replacing short fixed polling loops in the OpenClaw adapter tests with condition-based waits for model auth and personal WeChat installer sessions, reducing GitHub Actions timing flakes while preserving fast local exits

### 2026-04-12 17:00 CST

- fixed CI test ordering by running workspace test suites before repository release-script contract tests, keeping daemon tests on the last green execution path while preserving release workflow coverage
- split the GitHub Actions JavaScript validation into explicit workspace and release-script test steps so future failures identify the broken boundary instead of collapsing into one combined log

### 2026-04-12 16:45 CST

- fixed the long-term macOS download path by moving the tag-driven release workflow from legacy `.pkg` publishing to the signed, notarized `ChillClaw-macOS.dmg` asset expected by the website and packaged app update checker
- added script-level release contract coverage and wired script tests into `npm test` so release assets, website download links, and daemon app-update parsing stay aligned

### 2026-04-12 16:11 CST

- switched macOS distribution toward a branded drag-to-Applications DMG, including native app/product renaming, packaged icon and brand assets, installer script updates, release/update copy, and matching README guidance
- added shared ChillClaw brand marks across the React and native macOS shells, refreshed onboarding/settings presentation details, and kept the model-to-channel onboarding handoff visibly busy while slow daemon navigation finishes
- hardened OpenClaw uninstall and AI employee creation by clearing stale ChillClaw-managed agents, workspaces, chat state, and top-level channel bindings, filtering deleted managed agents from live rosters, repairing stale WeChat bind conflicts, and persisting the created onboarding employee before channel binding so retries do not create duplicates

### 2026-04-11 18:24 CST

- hardened the managed local AI onboarding handoff so ChillClaw can recover an already-installed Ollama model, keep the channel step from repeatedly rebuilding slow model summaries, and resolve stale draft model entry IDs to the current OpenClaw saved runtime entry before creating the AI employee
- fixed the personal WeChat and final AI employee steps across the daemon, React onboarding helpers, shared Swift client, and native macOS onboarding so staged channel setup, duplicate create taps, busy-state recovery, and draft model selection stay usable through slow OpenClaw status calls
- expanded daemon, web, shared Swift, and native macOS regression coverage for the repaired onboarding state transitions, model/channel config reuse, QR/channel progress, and create-AI-employee enablement paths, with additional state and adapter handoff logging for debugging

### 2026-04-09 23:22 CST

- hardened onboarding route and completion behavior by moving intro and runtime-install callers onto the canonical `/api/onboarding/*` endpoints, rejecting final completion when a staged cloud model can no longer reuse its saved auth, and sending stale later-step drafts back to model selection instead of pretending setup can still finish
- reduced expensive onboarding and engine rereads by reusing staged draft summaries during onboarding polling, parallelizing live summary fetches when a full summary is still needed, and fixing slow OpenClaw model snapshots so completed reads stay cached for the intended TTL instead of expiring immediately
- fixed managed personal WeChat installer PATH resolution, added machine-readable daemon OpenAPI reference files beside the route docs, and expanded daemon, web, and native macOS regression coverage for the renamed onboarding endpoints and the new auth-reuse and state-repair edge cases

### 2026-04-06 17:55 CST

- changed daemon-managed local AI downloads to stream Ollama pull progress through the backend, persist active local-runtime snapshots, dedupe concurrent install or repair requests, and automatically resume unfinished local-model downloads after reconnects, retries, and daemon restarts
- extended shared TypeScript and Swift local-runtime contracts so clients can observe active action, phase, digest, byte counts, and last-progress metadata, and hardened the native macOS shell by coalescing overlapping section refreshes that could trigger Swift concurrency aborts during onboarding handoff
- refreshed the public website to the latest Figma-driven landing structure with new product preview, how-it-works, and mascot showcase sections, repo-owned logo and workmaster assets, corrected GitHub/docs/license links, and broader localized homepage regression coverage

### 2026-04-05 22:05 CST

- hardened the managed local AI onboarding path after QA by fixing daemon-side Ollama command resolution, preventing stale onboarding draft state from skipping the new step 4 detection screen, and keeping the local-first model decision flow aligned between the daemon, React desktop UI, and native macOS app
- fixed native macOS step 4 local-runtime behavior so hardware detection, Ollama download progress, cloud fallback handoff, and timeout recovery stay in sync with daemon `local-runtime.*` events instead of freezing on the first setup step or surfacing false timeout popups while background setup is still advancing
- refined shared local-runtime contracts, event propagation, and connected-model presentation so dashboard, settings, and onboarding surfaces consistently report managed local runtime readiness, repair state, and the selected Ollama-backed model entry

### 2026-04-05 15:38 CST

- added a daemon-managed local AI deployment flow that inspects Apple Silicon Mac hardware, recommends a curated Ollama Qwen tier, installs or reuses the local Ollama runtime, downloads the selected model, and wires OpenClaw to the resulting `ollama/...` model entry automatically
- extended shared contracts, daemon routes, WebSocket events, and OpenClaw model coordination so managed local runtime status, install progress, repair actions, and recovery guidance stay aligned across the daemon, React desktop UI, shared Swift client, and native macOS app
- added onboarding, settings, dashboard, and native macOS surfaces for managed local AI, keeping onboarding focused on storage impact and install status while showing the actual chosen local model after setup completes in settings and connected-model health views

### 2026-04-05 14:36 CST

- tightened chat send behavior across the React and native macOS clients by blocking message sends while an OpenClaw gateway apply is still pending, surfacing clearer user guidance in the composer, and aligning the shared ChillClaw chat view model plus its regression coverage with that staged-versus-live runtime distinction
- refined the React chat composer so plain Return submits while Shift-Return inserts a newline, updated the shared localized chat copy for the new pending-apply state, and added matching desktop and native chat presentation tests
- fixed macOS native Swift package builds and tests from symlinked or mixed checkout paths by routing repo scripts through a canonicalized Swift package wrapper with an isolated CLI build directory, and added regression coverage for the path-normalization behavior

### 2026-04-05 11:10 CST

- hardened the daemon CI suite by replacing fixed chat-service sleep windows with condition-based waits and by widening the onboarding async handoff timeout budget, reducing GitHub Actions flakiness without changing product behavior

### 2026-04-04 19:50 CST

- added a GitHub-backed macOS app update flow owned by the daemon, including shared `appUpdate` contracts, new `/api/app/update` and `/api/app/update/check` routes, packaged-version detection, separate ChillClaw-versus-OpenClaw update messaging, and new app-update surfaces across the React and native macOS clients
- added a stronger GitHub delivery path for macOS with a new `main` CI workflow, a protected stable-release workflow that verifies `vX.Y.Z` tags against `package.json`, signs and notarizes `ChillClaw-macOS.pkg`, publishes generated release notes plus checksums, and keeps the public website download pointing at the latest stable installer asset automatically
- rebuilt chat toward the approved minimal edge-to-edge layout in both the React and native macOS clients, while tightening shared chat/runtime behavior with collapsible conversation rails, transcript/composer presentation cleanup, signed OpenClaw gateway device auth, backend request-response socket support, and filtering of hidden reasoning wrapper tags from visible assistant text

### 2026-03-31 21:15 CST

- changed the website download buttons in the hero, navigation, CTA, and footer to point directly at the published macOS installer asset instead of the GitHub releases index, with regression coverage to keep the direct-download target wired correctly

### 2026-03-31 20:19 CST

- sped up the final onboarding handoff by returning as soon as the AI employee, channel binding, and gateway setup are ready, while moving preset-skill verification and memory indexing into a persisted background warm-up task with live progress updates
- made onboarding completion atomic across daemon, web, and native macOS by sending the final employee draft inline with `/api/onboarding/complete`, returning a `warmupTaskId`, removing the extra completion-time employee save round trip, and reducing unnecessary post-complete refresh churn
- kept employee-step autosave lightweight by reusing already-staged model and channel draft state instead of repeatedly rebuilding full onboarding config during normal typing

### 2026-03-31 20:14 CST

- refreshed the public `apps/website` landing page to match the latest approved Figma Make structure more closely, including the added open-source section, updated hero and footer content, real ChillClaw repo/docs/releases links, and the website-local agent rules for future Figma copy refreshes
- aligned the website artwork selections to the approved design screenshots by switching the hero, four-step workflow, and CTA sections to the matching repo-local character assets and locking those choices in with homepage regression coverage

### 2026-03-31 19:23 CST

- redacted API keys, tokens, passwords, and other secret-bearing values from development command echo logs so onboarding and runtime diagnostics stay observable without printing credentials into the console
- extended the native onboarding model-save request timeout in `ChillClawKit` so longer OpenClaw provider setup calls can finish without the macOS client timing out too early

### 2026-03-31 19:15 CST

- changed the macOS installer build to compile only the packaged app prerequisites (`@chillclaw/contracts`, `@chillclaw/daemon`, and `@chillclaw/desktop-ui`) so public website assets are excluded from native macOS packaging

### 2026-03-31 19:11 CST

- fixed the macOS GitHub release workflow for Swift 6.2 packages by moving the runner to `macos-26`, selecting the latest stable Xcode toolchain explicitly, upgrading `actions/checkout` and `actions/setup-node` to `v5`, and logging the active Xcode, Swift, Node, and npm versions before packaging

### 2026-03-31 18:22 CST

- fixed the React onboarding build blocker by typing the `--onboarding-auth-method-count` CSS variable explicitly, so clean desktop UI production builds no longer fail during packaging
- added a tag-driven macOS GitHub release workflow that builds `ChillClaw-macOS.pkg`, generates a SHA-256 checksum, and publishes the first downloadable macOS package as a GitHub prerelease

### 2026-03-31 18:15 CST

- fixed onboarding model sign-in recovery so stale provider auth sessions no longer surface raw macOS popups and the draft falls back cleanly to the next valid state when the daemon reports the session ended
- fixed MiniMax onboarding auth so the daemon now launches explicit Global and China OAuth methods for OpenClaw, logs the interactive command path, and keeps the shared onboarding metadata aligned across daemon, shared Swift contracts, and native macOS tests
- fixed personal WeChat onboarding on native macOS by treating transient channel-session poll timeouts as recoverable, avoiding redundant full channel refreshes during QR login progress updates, and adding matching native and web onboarding regression coverage

### 2026-03-31 17:03 CST

- fixed the GitHub Pages website workflow custom-domain override by passing `VITE_BASE_PATH=/` during the Pages build, so website assets resolve correctly when the site is served from a custom domain instead of the repository subpath

### 2026-03-31 16:20 CST

- changed the GitHub Pages website deployment workflow to publish from `main` instead of `dev` so the repo can align with the current `github-pages` environment branch protections

### 2026-03-31 16:02 CST

- added a separate static `apps/website` marketing site with GitHub Pages deployment workflow support, root build and test wiring, bundled assets, and updated repo guidance in `README.md` and `AGENTS.md`
- improved onboarding auth-method presentation across web and native macOS by keeping provider auth cards aligned to shared width and height rules, keeping the native macOS chooser in a single row, and preventing stale OAuth session popups before the user explicitly continues the flow
- added explicit traceable scope names to shared daemon logs and repo-managed script console logs so runtime, config, onboarding, installer, and developer command output can be traced back to stable call sites more easily

### 2026-03-31 12:32 CST

- refreshed project documentation to match the current ChillClaw codebase, including the main README plus daemon routes, onboarding design, and OpenClaw command references
- added a workflow code-path reference that maps the main startup, onboarding, deploy, models, channels, chat, skills, task, and native integration flows back to their source files and service seams
- documented the current AI-team route split so the repo references reflect that overview reads are live while legacy member and team mutation routes remain temporarily unsupported

### 2026-03-31 02:08 CST

- moved more OpenClaw model-runtime ownership out of `OpenClawAdapter` and into the models config coordinator, including auth-profile sync, runtime-derived model cleanup, and config-write helpers, with refreshed architecture assertions and coordinator regression coverage
- restored the daemon-backed AI team overview read route so dashboard, chat, and onboarding refreshes no longer surface the temporary `501` backend-refactor placeholder when those flows request `/api/ai-team/overview`
- hid the AI Team entry from the React and native macOS sidebars for now while keeping the underlying screen and section wiring intact, and added navigation regression tests for both clients

### 2026-03-31 00:17 CST

- split the daemon server and OpenClaw integration into dedicated route modules plus capability, model, channel, chat, agent, and runtime lifecycle coordinators, and refreshed the backend reference maps and command docs to match the new structure
- improved runtime management by moving install, update, and uninstall behavior behind the new OpenClaw runtime lifecycle service, including a standard-runtime uninstall fallback that retries `npm uninstall openclaw -g` when the OpenClaw CLI uninstall leaves the system package behind
- polished the React and native macOS shell by aligning the language selector under the status card, adding the native macOS sidebar collapse toggle, and enlarging the native locale picker control so it matches the surrounding dashboard chrome
- fixed MiniMax setup across the daemon, web onboarding, and native macOS onboarding by supporting distinct Global and China API-key paths, using OpenClaw’s current provider onboarding flow instead of raw token paste for MiniMax auth, and showing the endpoint-specific auth method labels and descriptions in the onboarding cards

### 2026-03-30 16:51 CST

- rebuilt Configuration across the daemon, React UI, and native macOS app around live OpenClaw truth only, including refreshed Figma-aligned models and channels layouts, redesigned add-model and add-channel workflows, restored remove actions, and live-only pruning of stale saved state
- improved onboarding across web and native clients with stronger install progress feedback, clearer skip-to-dashboard and advanced-config paths, personal WeChat step 5 staging that defers pairing until final apply, and step 6 AI employee editing that stays local until the final create action
- fixed AI employee creation and channel binding reliability in the OpenClaw adapter by normalizing runtime WeChat bindings, preserving canonical live model keys, restoring per-agent provider auth from saved secrets for new MiniMax-backed members, and treating plugin-warning-only gateway restarts as non-fatal during finalization
- polished onboarding and configuration copy and native macOS presentation, including localized install-success wording, onboarding-only primary CTA emphasis, transparent startup/loading treatment, and matching native tab, card, and modal styling for the updated configuration flows

### 2026-03-29 20:26 CST

- changed Configuration in the daemon, React UI, and native macOS UI to show only models and channels that are currently live in OpenClaw, pruning stale historical model and channel state during refresh while keeping active interactive channel sessions separate from configured entries
- fixed overlapping fresh model reads so concurrent dashboard and configuration refreshes reuse the same in-flight OpenClaw model snapshot instead of repeating `models list --all --json`, and added fallback cleanup for personal WeChat removal when the upstream runtime rejects delete
- improved onboarding reliability by keeping personal WeChat in a waiting-for-scan state until login actually completes, speeding up AI employee creation by avoiding heavy autosave rebuilds, and updating onboarding model/channel consumers to recover cleanly from pruned live-only configuration entries
- polished onboarding across web and native clients with clearer install copy in English, Chinese, Japanese, Korean, and Spanish, stronger onboarding-only primary Next button styling, and lighter native loading-card treatment plus supporting regression coverage

### 2026-03-29 14:32 CST

- moved curated onboarding AI employee preset presentation and bundled preset-skill ownership into the daemon `ai-member-presets` catalog, made onboarding config selector-only, deleted the separate preset-skill definition file, and stopped first-run install from treating onboarding preset-skill sync as a blocking setup step
- replaced the generic onboarding draft patch flow with dedicated daemon-owned onboarding runtime, navigation, permissions, model, channel, employee, and session endpoints, and expanded shared TypeScript and Swift contracts so web and native clients can render authoritative install status, channel progress, preset avatars, and completion state from one source of truth
- simplified web and native onboarding around daemon-resolved preset and session data, including server-driven employee avatars, improved personal WeChat QR/session handling, duplicate WeChat installer suppression, native completion recovery after timeout, and refreshed shared loading-button polish with new regression coverage
- clarified README and onboarding docs around daemon-owned preset presentation and the current uninstall state-reset matrix, including the rule that setup-facing state is cleared only after uninstall succeeds and no OpenClaw runtime remains installed

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
- added a native shared UI layer under `apps/macos-native/Sources/ChillClawNative/UI` and migrated the native shell, onboarding, permissions, and main product screens onto shared surfaces, badges, buttons, metrics, and scaffold layouts
- added shared React `StatusBadge` and scaffold components, removed the broken `StatusPill` path, and moved the shared web styling layer to semantic token-driven variants instead of page-local status and scaffold drift
- added shared UI contract coverage for native badge/scaffold semantics and React status rendering, and normalized touched product-facing UI copy to `ChillClaw`
- documented shared UI reuse rules in `AGENTS.md` and now require timestamped changelog updates for future changelog entries

### Native macOS client

- added a new daemon-backed native macOS client under `apps/macos-native`
- added `apps/shared/ChillClawKit` with shared Swift protocol, daemon client, and chat UI packages
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
- added pending gateway-apply signals so ChillClaw can distinguish staged config from live/applied runtime state
- added the first hybrid daemon event-bus foundation:
  - shared `ChillClawEvent` contracts in TypeScript and Swift
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
- changed install/reuse to normalize inherited OpenClaw gateway config back to ChillClaw's local baseline so a stale remote gateway override cannot silently poison first-run health checks

### Model management

- replaced provider-only configuration with saved model entries
- added create and edit flows for saved model entries
- added default and fallback role management for saved entries
- changed normal saved entries so they stay as ChillClaw metadata until promoted into the runtime chain
- aligned model auth/setup commands with the current OpenClaw CLI `models auth` surface instead of relying on onboarding flows for single-secret provider auth
- added config-backed fallback recovery for safe model-chain mutations such as setting the default model when the OpenClaw CLI command shape drifts
- reconciled ChillClaw saved entries against the live OpenClaw runtime model chain so the UI reflects `openclaw models list --json`
- cleaned the Models page so it primarily shows configured models and runtime-detected models instead of exposing a separate saved-entry concept in the main UI
- clear stale configured-model state when the live OpenClaw runtime is clean or uninstalled, so a fresh install starts with an empty Models page

### Channel and gateway behavior

- stage runtime-affecting model, channel, skill, and AI-employee changes without restarting the gateway during save
- reserve gateway restart and live verification for gateway-manager actions such as restart/apply, login, pairing, and chat runtime use
- improved Telegram, WhatsApp, Feishu, and WeChat setup flows and recovery messaging
- added config-backed fallback recovery for known OpenClaw CLI drift on safe channel mutations such as Telegram, Feishu, and WeChat config writes and removals
- restored the Feishu setup guide in-product with direct links to the official OpenClaw and platform docs
- changed channel management to detect and show existing live OpenClaw channel accounts in addition to ChillClaw-managed entries
- added reusable approve-pairing actions for configured channels in the React Configuration page and fixed the dialog so successful pairing approval closes cleanly instead of leaving the modal open

### AI members and teams

- added real daemon-backed AI member and AI team management
- map each ChillClaw AI member to one OpenClaw agent with live detection of existing agents
- added member create, edit, remove, bind, and retention-aware delete flows
- generate richer per-agent workspaces with identity, soul, user, brain, tools, memory, bootstrap, knowledge, and skill files
- switched new member agent ids to readable `name + datetime` identifiers
- added daemon-owned AI member presets to shared contracts, service responses, onboarding, and the native member creation flow so curated starter roles and avatar presets stay aligned across clients

### Skills

- replaced the demo Skills page with a live installed-skill manager backed by OpenClaw
- added ClawHub explore, search, inspect, install, update, and remove flows
- added ChillClaw-managed custom skill create and edit flows
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
- clarified packaged-app detection and cleanup behavior around ChillClaw-managed runtimes stored under `~/Library/Application Support/ChillClaw`
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
- fixed managed-local first-run installs so ChillClaw re-detects the freshly installed OpenClaw CLI before verifying it, instead of failing against a stale cached “not installed” result
- extended native macOS client timeouts for long-running setup and deploy/install requests so real OpenClaw installs are less likely to fail with `The request timed out.`
