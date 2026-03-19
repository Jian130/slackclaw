# AGENTS.md

## Purpose

SlackClaw is a macOS-first, local-first product layer on top of OpenClaw. Its job is to make OpenClaw usable for non-technical users through guided install, onboarding, daily task flows, health checks, updates, and recovery.

This file captures the important operating rules for agents working in this repository.

## Product priorities

- Optimize for ordinary users, not operators or developers.
- Normal use must not require a terminal.
- Prefer clarity, reliability, and recovery over feature breadth.
- Keep the product opinionated. Do not expose raw engine complexity unless there is a strong user need.
- Treat “first useful result in under 15 minutes” as a core product constraint.

## Architecture rules

- Preserve the `UI -> local daemon -> EngineAdapter -> engine` boundary.
- Do not let frontend code call OpenClaw directly.
- Do not let product-layer daemon code depend on OpenClaw-specific internals outside the adapter implementation.
- Keep engine-specific logic confined to `apps/daemon/src/engine/*`.
- If adding a new engine later, do it by implementing the existing adapter seam first, not by branching product logic throughout the codebase.
- Treat future local-LLM backends as adapter work. Qwen-family models, MiniMax-compatible local gateways, Ollama, vLLM, LM Studio, and similar runtimes should integrate through the same product-layer seam.

## OpenClaw integration rules

- SlackClaw installs the latest available OpenClaw version by default for users.
- Only use an explicit OpenClaw version override for compatibility testing or controlled diagnostics.
- Always check for an existing compatible OpenClaw install before reinstalling.
- Reuse an existing compatible install when possible.
- If OpenClaw is missing or incompatible, use SlackClaw’s bootstrap/install path rather than inventing a second installer path.
- Distinguish between:
  - OpenClaw CLI installed
  - OpenClaw gateway/service reachable
  - OpenClaw healthy enough for user work
- Do not report the system as healthy just because `openclaw` exists on `PATH`.
- Do not couple product behavior to OpenClaw-only assumptions if the same behavior should later work for local-LLM adapters.

## UX rules

- Keep install, onboarding, health, update, and recovery messaging in plain language.
- Preserve localized UI support for English, Chinese, Japanese, Korean, and Spanish when changing frontend copy.
- Prefer one primary action per screen or panel.
- Surface recommended recovery actions first.
- When there is a failure, explain:
  - what is broken
  - what SlackClaw can do automatically
  - what the user should do next if auto-repair is insufficient
- Avoid adding advanced settings by default.

## Packaging and runtime rules

- The packaged app is currently a browser-served UI plus a bundled local daemon, not a native Tauri shell yet.
- The packaged macOS app should prefer a per-user `LaunchAgent` for daemon lifecycle instead of ad hoc background shell processes.
- Packaged runtime data should live under `~/Library/Application Support/SlackClaw`.
- Operational errors must be written to log files, not only returned to the UI. When adding new install, startup, shutdown, recovery, or external-command paths, make sure failures are persisted under the SlackClaw logs directory.
- The installed app must not assume it is running from the repo checkout.
- When changing paths, use runtime path helpers instead of `process.cwd()` assumptions.
- Keep the macOS installer build reproducible through `npm run build:mac-installer`.

## Repo-specific implementation guidance

- `apps/desktop-ui`: first-party user experience only
- `apps/daemon`: orchestration, policy, health, recovery, diagnostics, static asset serving in packaged mode
- `packages/contracts`: shared product/domain contracts; keep these stable and explicit
- `scripts/bootstrap-openclaw.mjs`: the single source of truth for OpenClaw install/reuse behavior
- `scripts/build-macos-installer.mjs`: the single source of truth for packaged macOS app assembly
- `scripts/start-dev.mjs`: the single source of truth for local end-to-end startup ordering during development
- `scripts/stop-dev.mjs`: the single source of truth for managed local dev-process teardown

## Scope control

- Do not chase full OpenClaw feature parity.
- Do not add multi-user, team admin, hosted sync, or channel-sprawl features to the MVP path unless explicitly requested.
- Do not widen the engine adapter contract unless a concrete product need justifies it.
- Avoid turning SlackClaw into a generic developer control panel.
- If future local-LLM support is added, keep it inside the install/lifecycle/health/task abstraction instead of adding raw model-provider configuration screens everywhere.

## Testing expectations

- Run `npm run build` after substantial changes.
- Run `npm test` after changing shared contracts, daemon behavior, or UI logic.
- If changing installer or runtime packaging behavior, also run `npm run build:mac-installer`.
- If changing local startup behavior, verify `npm start` still waits for the daemon and UI before reporting readiness.
- If changing local startup behavior, preserve clear step-by-step console output so `npm start` shows exactly what it is doing and what it is waiting for.
- If changing local startup or teardown behavior, verify `npm stop` removes the managed dev processes and clears `.data/dev-processes.json`.
- In development mode, external commands SlackClaw executes must be echoed to the console before they run so install, update, repair, and bootstrap behavior stays observable.
- Prefer validating real OpenClaw status/health behavior through the adapter when possible.

## When making changes

- Update `README.md` when install, runtime, packaging, or architecture behavior changes.
- Keep ADRs in `docs/adr` aligned when a core architectural rule changes.
- Preserve swapability with future engines like ZeroClaw or IronClaw.
- If a change improves developer convenience but hurts non-technical user simplicity, reject it unless explicitly requested.
