# ChillClaw Rename Design

**Date:** 2026-03-31

## Goal

Rename the project from its legacy product name to `ChillClaw` as a clean break across product copy, technical identifiers, package/module names, native app names, runtime artifacts, storage keys, and packaging outputs.

## Scope

- Product-facing strings renamed to `ChillClaw`
- Lowercase technical identifiers renamed to `chillclaw`
- JS/TS workspace package scopes renamed to `@chillclaw/*`
- Swift package/module/target/product names renamed to `ChillClaw*`
- Native packaging/runtime identifiers:
  - app names, daemon binary names, LaunchAgent labels, bundle IDs, app-support paths, temp prefixes
- Repo docs, tests, scripts, and editor config

## Non-Goals

- No compatibility layer for old branded installs or data
- No state migration from old keys or paths
- No attempt to preserve old bundle IDs, LaunchAgent labels, or local storage keys

## Constraints

- Preserve the existing product architecture and behavior
- Keep `openclaw` identifiers unchanged where they refer to the upstream engine
- Keep changes coordinated so package/module renames land together with their imports and build scripts

## Approach

1. Rename workspace package scopes and imports so TS builds have a coherent package graph.
2. Rename Swift package products, targets, directories, and imports so native builds have a coherent module graph.
3. Rename runtime and packaging identifiers so built outputs, LaunchAgents, app names, and local paths all say `ChillClaw`.
4. Sweep product copy, docs, tests, and config for any remaining legacy-name strings that should move to `ChillClaw`.
5. Verify with targeted searches plus full build/test commands.

## Clean-Break Consequences

- Existing legacy local data will no longer be discovered by default if it lives under old names or paths.
- Existing legacy browser storage keys will no longer be read.
- Existing macOS packaged-app helpers using old labels or names will no longer be reused.
- Users upgrading from an old local checkout or packaged app will effectively start fresh under `ChillClaw`.

## Verification

- `rg -n "ChillClaw|chillclaw"` should match the renamed project identifiers
- `npm run build`
- `npm test`
- `npm run test:mac-native`
