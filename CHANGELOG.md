# Changelog

## 0.1.0 - 2026-03-08

### Added

- Initial SlackClaw monorepo scaffold with React frontend, local TypeScript daemon, shared contracts, and architecture ADRs.
- `EngineAdapter` seam with `OpenClawAdapter` and `MockAdapter`.
- OpenClaw bootstrap flow that reuses an existing pinned `2026.3.7` install before reinstalling.
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
- Future adapter direction is now explicit: SlackClaw should remain able to support local LLM runtimes and additional engines without product-layer rewrites.

### Notes

- The generated macOS installer is currently unsigned.
- Tauri packaging remains future work; the current packaged app is a browser-served UI plus a bundled local daemon.
