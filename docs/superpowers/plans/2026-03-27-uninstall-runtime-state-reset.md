# Uninstall Runtime State Reset Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset ChillClaw's persisted runtime-facing setup state when either deployment uninstall path removes OpenClaw, so Models and Channels return to a clean post-uninstall state.

**Architecture:** Keep the behavior in the daemon route layer, where ChillClaw already owns product-level uninstall semantics. Extract a small uninstall-reset helper in `server.ts`, reuse it for both full-engine uninstall and deployment-target uninstall, and cover the reset rule with focused daemon tests.

**Tech Stack:** Node.js, TypeScript, node:test

---

### Task 1: Add failing daemon tests for uninstall reset behavior

**Files:**
- Modify: `apps/daemon/src/server.test.ts`
- Modify: `apps/daemon/src/server.ts`

- [ ] **Step 1: Write a failing test that proves successful managed-local target uninstall resets persisted setup and channel onboarding state**
- [ ] **Step 2: Write a failing test that proves successful standard target uninstall resets the same persisted state**
- [ ] **Step 3: Run `npm test --workspace @slackclaw/daemon -- server.test.ts` to verify the new tests fail for the expected reason**

### Task 2: Implement the centralized uninstall reset helper

**Files:**
- Modify: `apps/daemon/src/server.ts`

- [ ] **Step 1: Extract a helper that clears uninstall-sensitive persisted daemon state**
- [ ] **Step 2: Reuse that helper in `/api/engine/uninstall`**
- [ ] **Step 3: Reuse that helper in `/api/deploy/targets/:id/uninstall` when uninstall succeeds and no OpenClaw runtime remains installed**
- [ ] **Step 4: Re-run `npm test --workspace @slackclaw/daemon -- server.test.ts` to verify the tests pass**

### Task 3: Verify the daemon package and repo-level regression surface

**Files:**
- Modify: `apps/daemon/src/server.test.ts`
- Modify: `apps/daemon/src/server.ts`

- [ ] **Step 1: Run `npm test --workspace @slackclaw/daemon`**
- [ ] **Step 2: Run `npm run build --workspace @slackclaw/daemon`**
