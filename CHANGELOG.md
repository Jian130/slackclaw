# Changelog

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
