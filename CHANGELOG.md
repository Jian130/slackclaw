# Changelog

## 0.1.3 - 2026-03-11

### Fixed

- Feishu prepare now checks the installed OpenClaw plugin inventory before running `openclaw plugins install @openclaw/feishu`, so newer OpenClaw builds that already bundle Feishu are reused instead of creating duplicate plugin installs.
- Feishu prepare now reports broken bundled-plugin states as OpenClaw/plugin problems instead of attempting another install that would worsen duplicate-plugin warnings.
- `npm start` now binds the desktop UI dev server to `127.0.0.1`, so the local startup flow no longer hangs waiting for a UI that Vite started only on IPv6 loopback.

### Changed

- The `Configuration` route now follows the Figma Make design more closely, including the redesigned AI model setup flow, add-model dialog, and channel layout.
- OpenClaw model configuration now supports richer backend provider detection, interactive auth session handling, browser-assisted OAuth flows, and provider refresh after auth completion.
- Feishu is now a first-class official channel in the shared contracts, overview state, and configuration UI instead of being treated like a generic workaround.
- The Feishu setup flow now follows the official OpenClaw Feishu guide more closely:
  - separate prepare step
  - plugin-aware setup
  - permission import guidance
  - bot capability step
  - OpenClaw config save step
  - gateway/test step
- Feishu channel setup now ends in `awaiting-pairing` and SlackClaw exposes an explicit Feishu pairing-code approval action in the UI and daemon.

## 0.1.2 - 2026-03-10

### Fixed

- SlackClaw now detects provider authentication readiness from `openclaw models status --json`, so OAuth and auth-profile flows can flip from `Configure` to `Add Model` before a default model is applied.
- The `Add New Model` dialog now keeps polling backend OpenClaw model/provider state after `Configure` until the selected provider is actually marked configured.
- Locale switching now updates the Figma-based configuration UI instead of leaving large parts of the screen hardcoded in English.

### Changed

- The app-shell language selector now follows the Figma shell position and pattern, with a compact globe-and-flag control in the main-content header instead of the sidebar footer.
- The `Configuration -> Add New Model` flow now follows the Figma Make design more closely:
  - provider grid first
  - selected-provider banner second
  - provider-logo tiles instead of generic initials
  - system-font treatment and wider dialog layout
- Model setup is now a two-step action in the dialog:
  - `Configure` authenticates the provider in OpenClaw
  - `Add Model` applies the selected model and closes the dialog after the refreshed backend state is reflected in SlackClaw
- Switching providers in the add-model dialog now defaults to that provider's own sample model instead of incorrectly prefilling the current global default from another provider.

## 0.1.1 - 2026-03-09

### Fixed

- macOS installer now ships a self-contained `slackclaw-daemon` executable instead of bundling a raw Node runtime from the build machine.
- LaunchAgent and direct-launch startup now run the standalone daemon binary, removing the previous `dyld` failures around `libnode.141.dylib`.
- macOS launcher and daemon startup logs now include timestamps so fresh startup attempts can be separated from stale historical log lines.

### Changed

- SlackClaw setup now prefers an existing compatible OpenClaw install, but otherwise deploys a SlackClaw-managed local OpenClaw runtime under `~/Library/Application Support/SlackClaw/data/openclaw-runtime`.
- The packaged OpenClaw setup path now verifies that a locally deployed OpenClaw can actually execute before SlackClaw reports setup success.
- SlackClaw now exposes an explicit `Deploy OpenClaw locally` action that forces deployment into the managed local runtime instead of just reusing a system OpenClaw.
- Install and setup failures in the UI now show the daemon's real error message instead of a generic HTTP status.
- SlackClaw now exposes app-level `Stop SlackClaw` and `Uninstall SlackClaw` actions from the UI.
- Uninstall now removes the LaunchAgent, SlackClaw-managed local data, and the packaged app bundle after the daemon exits.
- When `npm` is missing, SlackClaw now tries to install the required `node`/`npm` toolchain and `git` through Homebrew before giving up on local OpenClaw deployment.
- SlackClaw now includes a guided channel setup UI for Telegram, WhatsApp, and an experimental WeChat workaround path, followed by a final gateway restart step.
- WhatsApp login output now streams back into SlackClaw so the user can monitor the OpenClaw login session from the UI.
- The setup order is now explicit: deploy OpenClaw first, run onboarding second, configure channels third, and start the gateway last.

## 0.1.0 - 2026-03-08

### Added

- Initial SlackClaw monorepo scaffold with React frontend, local TypeScript daemon, shared contracts, and architecture ADRs.
- `EngineAdapter` seam with `OpenClawAdapter` and `MockAdapter`.
- OpenClaw bootstrap flow that reuses an existing pinned `2026.3.7` install before reinstalling.
- `npm start` development orchestrator that runs bootstrap, waits for daemon readiness, starts the UI, and shuts both processes down together.
- `npm stop` development teardown script that stops the managed SlackClaw daemon and UI from another terminal.
- First-run intro and setup flow that only shows the intro once, then checks for an existing OpenClaw, reuses or installs the pinned runtime, and tries to bring the local engine up before showing the full app.
- Real OpenClaw CLI integration for status, health, update checks, diagnostics, onboarding, and local task execution.
- First-run UI for install, onboarding, first task, health, recovery, history, and diagnostics export.
- macOS packaging pipeline that builds `SlackClaw.app` and `SlackClaw-macOS.pkg`.
- Packaged runtime support for serving static frontend assets from the daemon.
- LaunchAgent lifecycle management for packaged macOS installs, including install, restart, uninstall, and status reporting.
- Multilingual UI support for English, Chinese, Japanese, Korean, and Spanish.
- Project-level `AGENTS.md` guidance for future contributors and coding agents.

### Changed

- README now documents the system structure, packaging flow, supported languages, and installer/runtime model.
- Installer launch behavior now prefers a managed macOS LaunchAgent over an ad hoc background shell process.
- Packaged app startup now uses a fast `/api/ping` readiness check and falls back to starting the bundled daemon directly if LaunchAgent startup does not come up in time.
- Packaged launcher now opens the localhost UI only after daemon reachability is confirmed; otherwise it opens a troubleshooting page with log locations.
- macOS packaging now bundles the required Node shared libraries and fixes the LaunchAgent command so the packaged daemon can start on Macs without Homebrew Node libraries.
- OpenClaw install/setup now attempts `openclaw gateway restart` when the gateway is detected as down.
- Future adapter direction is now explicit: SlackClaw should remain able to support local LLM runtimes and additional engines without product-layer rewrites.

### Notes

- The generated macOS installer is currently unsigned.
- Tauri packaging remains future work; the current packaged app is a browser-served UI plus a bundled local daemon.
