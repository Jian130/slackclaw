# Traceable Logging Design

**Date:** 2026-03-31

## Goal

Make ChillClaw logs traceable by including a stable, human-readable function or call-site scope in every shared daemon log line and every repo-maintained script console log, without relying on fragile stack-trace parsing.

## Scope

- Extend the daemon logger so file logs and console logs can carry an explicit scope such as `server.startServer` or `openclawAdapter.logSoftFailure`
- Update daemon log call sites that already use the shared logger to provide stable scopes
- Normalize repo-managed script logging under `scripts/` so console output includes a matching scoped format
- Add or update tests for the scoped logger formatting and the script helpers that adopt it

## Non-Goals

- No automatic function-name inference from runtime stack traces
- No attempt to intercept every raw `console.*` call across third-party code or dependencies
- No broad logging refactor in the React UI or Swift native client where there is not already a shared logging seam
- No change to the meaning, retention, or destination of existing logs beyond the added traceable scope

## Constraints

- Keep logs readable for ordinary humans debugging local installs and onboarding failures
- Preserve existing daemon logging behavior where logging failures must never crash the app
- Avoid introducing brittle metadata that changes whenever a function is renamed internally unless the call-site identity actually changes
- Prefer a small shared contract over one-off string formatting at each call site
- Keep the daemon the source of truth for product-layer operational logging behavior

## Current Problems

- The daemon logger timestamps messages, but many entries do not identify the precise function or call-site that emitted them
- Error logs such as server failures and adapter soft failures can be hard to trace back quickly when several nearby flows share similar wording
- Repo-managed scripts use ad hoc `console.log` and `console.error` formatting, so startup, bootstrap, and packaging logs are less consistent than daemon logs
- Automatic stack-derived function names would be tempting, but they are unreliable across async boundaries, transpilation, and script execution contexts

## Design

### 1. Use explicit scoped logging instead of stack inspection

Add an explicit `scope` field to the shared daemon logger interface rather than inferring function names.

The core format becomes conceptually:

- file log: `2026-03-31T...Z [ERROR][server.startServer] Daemon request failed. {...}`
- console log: `2026-03-31T...Z [ChillClaw daemon][server.startServer] Daemon listening on ...`

This gives us stable, searchable identifiers that are:

- easy to grep
- easy to preserve in tests
- consistent across daemon modules and scripts
- independent of runtime stack formatting

### 2. Extend the daemon logger API with scoped helpers

Refine `apps/daemon/src/services/logger.ts` so the shared helpers accept an optional or required scope argument depending on helper type.

Target helper shape:

- `formatConsoleLine(message, { scope? })`
- `writeErrorLog(message, details?, { scope })`
- `writeInfoLog(message, details?, { scope })`
- `logDevelopmentCommand(scope, command, args)`

The exact function signatures can be tuned for ergonomics, but the important design rule is that shared logging helpers own the string formatting and call sites provide the scope.

### 3. Roll out scopes through daemon-owned operational logs first

Update the daemon call sites already using the shared logger so each log line names the logical function or method that emitted it.

Priority areas:

- `apps/daemon/src/index.ts`
- `apps/daemon/src/server.ts`
- `apps/daemon/src/engine/openclaw-adapter.ts`
- `apps/daemon/src/services/*` files already calling `writeErrorLog`, `writeInfoLog`, or `logDevelopmentCommand`
- platform adapters that emit operational command logs

Scope naming rules:

- Prefer `module.functionName` or `ClassName.methodName`
- Use stable logical names, not line numbers
- Keep them short and grep-friendly
- Use one canonical scope string per call site

Examples:

- `index.serverListening`
- `server.serveStaticAsset`
- `server.requestHandler`
- `OpenClawAdapter.logSoftFailure`
- `AppControlService.runPackagedScript`

### 4. Normalize repo scripts with the same scoped convention

For repo-maintained scripts, add local helper formatting instead of scattering raw `console.*` calls.

The scripts do not need to import daemon logger code, but they should converge on the same concept:

- timestamp
- product/script prefix
- explicit scope
- message

Example:

- `[ChillClaw start][waitForPort] Waiting for daemon on ...`
- `[ChillClaw bootstrap][runBootstrapCommand] openclaw ...`

This keeps development and packaging logs traceable without coupling scripts to daemon runtime internals.

### 5. Keep UI and native logging out of scope unless they gain a shared seam

Current evidence shows the active, product-owned operational logging surface is mostly daemon and scripts.

That means this pass should not force artificial logger abstractions into:

- React components that are not currently doing operational logging
- SwiftUI/native files that do not currently maintain a shared logger path

If later work introduces a native or web operational logger, it should follow the same explicit-scope principle.

## Naming Rules

- Use American English in scope strings and messages
- Scopes should identify where the log came from, not restate the whole error message
- Prefer `camelCase` function names when mirroring TypeScript/JavaScript functions
- Prefer `TypeName.methodName` for class methods
- Avoid anonymous scope fragments like `handler`, `callback`, or `step1` unless they are the only stable identity available

## Error Handling

- Logging failures must continue to be swallowed inside the logger helpers
- Missing details payloads should continue to render cleanly
- Existing error payload serialization should remain unchanged except for the added scope metadata in the formatted line
- Script logging helpers should never throw just because a scope or message contains unusual characters

## Testing

- Update `apps/daemon/src/services/logger.test.ts` to assert the scoped console format
- Add targeted tests for file-log formatting if needed
- Add focused tests for script helper formatting where those scripts already have test coverage, or add narrow unit-style coverage if extracting helpers makes that practical
- Prefer targeted logger tests over brittle integration snapshots of entire command output

## Verification

- `npm run build`
- `npm test`
- targeted grep checks confirming updated daemon log call sites now pass explicit scopes
- manual smoke checks for:
  - daemon startup log lines
  - a representative daemon error log
  - `scripts/start-dev.mjs`
  - `scripts/bootstrap-openclaw.mjs`

## Implementation Notes

- Start with the logger contract first, then update daemon call sites, then normalize scripts
- Avoid partial formatting logic duplicated in call sites
- Keep this as a product-layer logging improvement, not a general-purpose observability platform
