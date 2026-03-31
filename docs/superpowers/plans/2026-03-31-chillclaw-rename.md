# ChillClaw Rename Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the legacy project name to ChillClaw across the repo as a clean break, including package/module names, runtime identifiers, and product copy.

**Architecture:** Execute the rename in coordinated slices so identifiers that depend on one another move together. Start with package/module graphs, then packaging/runtime names, then sweep docs/tests and verify with full repo commands.

**Tech Stack:** TypeScript, Node.js, npm workspaces, Swift Package Manager, SwiftUI, macOS packaging scripts

---

## Chunk 1: Package and Import Graph

### Task 1: Rename JS/TS package scopes and references

**Files:**
- Modify: `package.json`
- Modify: `apps/*/package.json`
- Modify: `packages/*/package.json`
- Modify: JS/TS import sites referencing the legacy package scope

- [ ] Rename workspace package names to `@chillclaw/*`
- [ ] Update workspace scripts and import sites to use the new scopes
- [ ] Run targeted searches to confirm no old scopes remain in tracked JS/TS files

### Task 2: Rename Swift package products, targets, and imports

**Files:**
- Modify: `apps/macos-native/Package.swift`
- Modify: `apps/shared/ChillClawKit/Package.swift`
- Modify: Swift source/test imports under `apps/macos-native` and `apps/shared/ChillClawKit`
- Rename: Swift package source/test directories if needed

- [ ] Rename Swift package/product/target/module identifiers to `ChillClaw*`
- [ ] Update Swift imports and target references
- [ ] Rename tracked directories/files that embed old Swift package names

## Chunk 2: Runtime and Packaging

### Task 3: Rename runtime, app, and installer identifiers

**Files:**
- Modify: `scripts/build-macos-installer.mjs`
- Modify: `scripts/start-dev.mjs`
- Modify: `scripts/stop-dev.mjs`
- Modify: `scripts/bootstrap-openclaw.mjs`
- Modify: daemon/native runtime path helpers and related tests

- [ ] Rename app names, daemon binary names, LaunchAgent labels, bundle IDs, app-support paths, and storage keys
- [ ] Keep upstream `openclaw` names unchanged
- [ ] Re-run searches for remaining legacy runtime identifiers

## Chunk 3: Sweep and Verify

### Task 4: Sweep docs, tests, and configs

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `.vscode/*`
- Modify: tracked tests and fixtures containing old names

- [ ] Replace remaining old project names in tracked docs/tests/configs
- [ ] Leave only intentional historical references if they are still needed

### Task 5: Verification

**Files:**
- Verify repo-wide

- [ ] Run a repo-wide search for any remaining legacy-name variants
- [ ] Run `npm run build`
- [ ] Run `npm test`
- [ ] Run `npm run test:mac-native`
- [ ] Record any remaining intentional exceptions or blockers
