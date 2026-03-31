# Traceable Logging Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit, traceable function or call-site scopes to ChillClaw's shared daemon logs and repo-managed script console logs.

**Architecture:** Extend the daemon logger with first-class scope metadata instead of stack-trace inference, then roll that contract through daemon call sites and a small shared script logging helper. Keep formatting centralized so call sites provide only stable scope names and message/details payloads.

**Tech Stack:** TypeScript, Node.js, native `node:test`, existing daemon logger utilities, repo-managed `.mjs` scripts

---

## Chunk 1: Logger Contract

### Task 1: Add failing daemon logger tests for scoped formatting

**Files:**
- Modify: `apps/daemon/src/services/logger.test.ts`
- Modify: `apps/daemon/src/services/logger.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions that:
- `formatConsoleLine("...", { component: "ChillClaw daemon", scope: "index.serverListening" })` includes both bracketed segments in the right order
- `logDevelopmentCommand("openclaw.spawnCommand", "/opt/homebrew/bin/openclaw", ["status", "--json"])` prints `[ChillClaw daemon][openclaw.spawnCommand]`

- [ ] **Step 2: Run the daemon logger test to verify it fails**

Run: `npm test --workspace @chillclaw/daemon -- logger`
Expected: FAIL because the logger does not yet support scoped formatting metadata

- [ ] **Step 3: Implement the scoped logger contract**

Update `apps/daemon/src/services/logger.ts` to:
- add a small metadata type for `scope` and optional console `component`
- include `[scope]` in file-log formatting
- include `[component][scope]` in console formatting when provided
- keep log failure swallowing behavior unchanged

- [ ] **Step 4: Run the daemon logger test to verify it passes**

Run: `npm test --workspace @chillclaw/daemon -- logger`
Expected: PASS

## Chunk 2: Daemon Rollout

### Task 2: Update daemon entrypoints and services to provide explicit scopes

**Files:**
- Modify: `apps/daemon/src/index.ts`
- Modify: `apps/daemon/src/server.ts`
- Modify: `apps/daemon/src/services/app-control-service.ts`
- Modify: `apps/daemon/src/services/app-service-manager.ts`
- Modify: `apps/daemon/src/services/chat-service.ts`
- Modify: `apps/daemon/src/platform/macos-keychain-secrets-adapter.ts`
- Modify: `apps/daemon/src/engine/openclaw-adapter.ts`
- Modify: `apps/daemon/src/engine/openclaw-models-config-coordinator.ts`
- Modify: `apps/daemon/src/engine/openclaw-channels-config-coordinator.ts`
- Modify: `apps/daemon/src/engine/openclaw-models-config-coordinator.test.ts`
- Modify: `apps/daemon/src/engine/openclaw-channels-config-coordinator.test.ts`

- [ ] **Step 1: Write or update failing tests for daemon consumers that now require scoped logger calls**

Adjust the coordinator test doubles so their `writeErrorLog` signatures match the new logger contract, and add any narrow assertions needed if compilation alone is not sufficient.

- [ ] **Step 2: Run the targeted daemon test slice to verify it fails**

Run: `npm test --workspace @chillclaw/daemon -- logger openclaw-models-config-coordinator openclaw-channels-config-coordinator`
Expected: FAIL or compile error because daemon call sites and test doubles have not yet been updated to pass scopes

- [ ] **Step 3: Update daemon call sites with stable scope names**

Apply explicit scopes such as:
- `index.serverListening`
- `index.uncaughtException`
- `server.serveStaticAsset`
- `server.requestStreamError`
- `server.requestHandler`
- `server.routeNotFound`
- `server.clientError`
- `AppControlService.runDetachedScript`
- `AppServiceManager.runLaunchAgentAction`
- `ChatService.sendMessage`
- `OpenClawAdapter.logSoftFailure`
- `OpenClawModelsConfigCoordinator.startInteractiveAuthSession`
- `OpenClawChannelsConfigCoordinator.startWhatsAppLogin`

Keep names short and grep-friendly, using one canonical scope per call site.

- [ ] **Step 4: Run the targeted daemon test slice to verify it passes**

Run: `npm test --workspace @chillclaw/daemon -- logger openclaw-models-config-coordinator openclaw-channels-config-coordinator`
Expected: PASS

## Chunk 3: Script Rollout

### Task 3: Add a shared script logging helper and migrate raw script console output

**Files:**
- Create: `scripts/logging.mjs`
- Create: `scripts/logging.test.mjs`
- Modify: `scripts/start-dev.mjs`
- Modify: `scripts/bootstrap-openclaw.mjs`
- Modify: `scripts/stop-dev.mjs`
- Modify: `scripts/test-engine-compatibility.ts`
- Modify: `scripts/build-macos-installer.mjs`

- [ ] **Step 1: Write the failing script logging tests**

Add `node:test` coverage for the shared script helper that asserts:
- formatted lines include timestamp, script label, and scope
- error formatting uses the same scoped structure

- [ ] **Step 2: Run the script logging test to verify it fails**

Run: `node --test scripts/logging.test.mjs`
Expected: FAIL because the helper does not exist yet

- [ ] **Step 3: Implement the shared script logging helper and migrate scripts**

Create a helper with centralized formatting, then update scripts to replace raw `console.log` and `console.error` calls with explicit scopes such as:
- `start-dev.logStep`
- `start-dev.fail`
- `start-dev.runBackgroundStep`
- `bootstrap-openclaw.logBootstrapCommand`
- `stop-dev.main`
- `test-engine-compatibility.main`
- `build-macos-installer.main`

Keep the human-readable message content the same except for the added traceable scope.

- [ ] **Step 4: Run the script logging test to verify it passes**

Run: `node --test scripts/logging.test.mjs`
Expected: PASS

## Chunk 4: Full Verification

### Task 4: Run fresh end-to-end verification for the logging rollout

**Files:**
- Modify: none

- [ ] **Step 1: Run the full JS build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 2: Run the full JS test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Run focused logging verification commands**

Run:
- `npm test --workspace @chillclaw/daemon -- logger`
- `node --test scripts/logging.test.mjs`

Expected: PASS

- [ ] **Step 4: Review the changed file set**

Run: `git diff --stat -- apps/daemon/src/services/logger.ts apps/daemon/src/services/logger.test.ts apps/daemon/src/index.ts apps/daemon/src/server.ts apps/daemon/src/services apps/daemon/src/engine apps/daemon/src/platform scripts`
Expected: only the planned logging files changed
