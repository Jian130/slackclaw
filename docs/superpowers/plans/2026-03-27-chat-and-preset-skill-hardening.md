# Chat And Preset Skill Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining chat UX/composer gaps and make curated preset skills installable, durable, and repairable across onboarding and member management.

**Architecture:** Keep the existing daemon-authored snapshot/event model, but tighten the last product seams instead of adding parallel flows. Chat fixes stay split between shared protocol/state, web React surface, and native SwiftUI surface; preset-skill fixes stay daemon-owned so clients render readiness and repair state rather than reimplementing installation logic.

**Tech Stack:** TypeScript, React, Node.js daemon, SwiftUI, AppKit bridge, Vitest, Node test runner, Swift Testing

---

## Chunk 1: Web Chat Composer Safety And Inline Activity

### Task 1: Harden keyboard send behavior

**Files:**
- Modify: `apps/desktop-ui/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop-ui/src/features/chat/ChatPage.test.tsx`

- [ ] Add failing tests for `Enter` submit, `Shift+Enter` newline, IME composition guard, and `canSend === false` keyboard behavior.
- [ ] Run the chat page tests and verify the new cases fail for the expected reasons.
- [ ] Add one shared composer-send predicate used by both the button and `handleComposerKeyDown`.
- [ ] Guard keyboard submit on trimmed draft, `canSend`, and composition state, including Safari-style fallback behavior.
- [ ] Re-run the chat page tests and confirm green.

### Task 2: Attach tool activity to the active assistant run

**Files:**
- Modify: `apps/desktop-ui/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop-ui/src/features/chat/ChatPage.test.tsx`

- [ ] Add failing tests for inline tool-activity rendering and unread-count behavior during repeated assistant deltas.
- [ ] Run the focused chat tests and confirm failure.
- [ ] Render ordered tool activity rows alongside the active assistant turn instead of only header badges.
- [ ] Keep header badges as summary-only state.
- [ ] Re-run the focused chat tests and confirm green.

## Chunk 2: Daemon Preset-Skill Ownership And Member Provenance

### Task 3: Make bundled preset skills truly installable

**Files:**
- Modify: `apps/daemon/src/engine/adapter.ts`
- Modify: `apps/daemon/src/engine/openclaw-adapter.ts`
- Modify: `apps/daemon/src/engine/mock-adapter.ts`
- Modify: `apps/daemon/src/services/preset-skill-service.ts`
- Modify: `apps/daemon/src/services/preset-skill-service.test.ts`

- [ ] Add failing tests proving bundled preset skills cannot currently transition from install to verify.
- [ ] Run the preset-skill service tests and capture the failing assertion.
- [ ] Implement a real bundled-install path in the OpenClaw adapter using the configured asset location instead of returning metadata only.
- [ ] Update the mock adapter to model bundled installs consistently.
- [ ] Re-run the preset-skill tests and confirm green.

### Task 4: Preserve curated preset provenance on member saves

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`
- Modify: `apps/daemon/src/config/ai-member-presets.ts`
- Modify: `apps/daemon/src/services/ai-team-service.ts`
- Modify: `apps/daemon/src/services/ai-team-service.test.ts`
- Modify: `apps/desktop-ui/src/features/members/MembersPage.tsx`
- Modify: `apps/desktop-ui/src/features/members/MembersPage.test.tsx`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Models.swift`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Requests.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/Screens.swift`

- [ ] Add failing tests that member presets and save requests still collapse to raw runtime skill IDs.
- [ ] Run the relevant daemon and web tests and confirm failure.
- [ ] Extend member preset/request models so curated presets keep `presetSkillIds` alongside resolved runtime `skillIds`.
- [ ] Update AI-team save logic to persist and return curated preset metadata instead of dropping provenance after onboarding.
- [ ] Update web and native member-edit flows to submit curated preset IDs when a preset is chosen and keep manual skill editing separate.
- [ ] Re-run the affected tests and confirm green.

### Task 5: Make “verified” mean “usable”

**Files:**
- Modify: `apps/daemon/src/engine/openclaw-adapter.ts`
- Modify: `apps/daemon/src/services/preset-skill-service.ts`
- Modify: `apps/daemon/src/services/ai-team-service.ts`
- Modify: `apps/daemon/src/services/preset-skill-service.test.ts`
- Modify: `apps/daemon/src/services/ai-team-service.test.ts`
- Modify: `apps/desktop-ui/src/features/onboarding/helpers.ts`
- Modify: `apps/desktop-ui/src/features/onboarding/helpers.test.ts`

- [ ] Add failing tests for the case where a skill is present by slug but not eligible for member assignment.
- [ ] Run the focused daemon tests and verify the expected failure.
- [ ] Tighten verification to require a usable runtime skill entry, not just slug presence.
- [ ] Align onboarding readiness helpers with the stricter daemon meaning.
- [ ] Re-run the focused daemon and web helper tests and confirm green.

### Task 6: Fold preset-skill reconcile and repair into first-run and settings

**Files:**
- Modify: `apps/daemon/src/services/setup-service.ts`
- Modify: `apps/daemon/src/server.ts`
- Modify: `apps/daemon/src/services/skill-service.ts`
- Modify: `apps/desktop-ui/src/features/skills/SkillsPage.tsx`
- Modify: `apps/macos-native/Sources/ChillClawNative/AppState.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/Screens.swift`
- Modify: tests around setup, skills, and app state

- [ ] Add failing tests for first-run setup missing preset reconcile and for repair actions not being surfaced.
- [ ] Run the focused setup/skills/app-state tests and confirm failure.
- [ ] Ensure first-run setup uses the selected preset skill intent early enough to reconcile immediately after runtime install/reuse.
- [ ] Add a dedicated repair action that re-runs preset-skill reconcile from both web and native surfaces.
- [ ] Re-run the affected tests and confirm green.

## Chunk 3: Native Chat Optimism And Composer Parity

### Task 7: Add optimistic send and richer active-run rendering on macOS

**Files:**
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawChatUI/ChatViewModel.swift`
- Modify: `apps/shared/ChillClawKit/Tests/ChillClawKitTests/ChatViewModelTests.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/Screens.swift`
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/ChatPresentationTests.swift`

- [ ] Add failing tests for optimistic local send state, pending assistant UI, and send-button disabled behavior on empty drafts.
- [ ] Run the shared/native chat tests and confirm failure.
- [ ] Mirror the web optimistic-send path in the shared Swift view model and keep transcript status/tool activity attached to the active assistant run.
- [ ] Update the macOS screen to render chat-native transcript rows, inline tool activity, and better degraded transport treatment.
- [ ] Re-run the shared/native chat tests and confirm green.

### Task 8: Implement explicit macOS composer semantics

**Files:**
- Modify: `apps/macos-native/Sources/ChillClawNative/Screens.swift`
- Create or modify: native chat input helper bridging AppKit key handling if needed
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/ChatPresentationTests.swift`

- [ ] Add failing tests for `Enter sends`, `Shift+Enter` newline, and blocked send while a run is active.
- [ ] Run the native chat tests and confirm failure.
- [ ] Replace the default chat input path with an explicit multiline editor that handles Return/Shift-Return and respects marked text/composition.
- [ ] Keep send disabled state aligned with the same predicate as the actual send path.
- [ ] Re-run the native chat tests and confirm green.

## Chunk 4: Verification

### Task 9: Full verification sweep

**Files:**
- Modify only as needed based on failures above

- [ ] Run `npm test --workspace @chillclaw/contracts`.
- [ ] Run focused daemon tests for preset skill, setup, AI team, and chat.
- [ ] Run `npm test --workspace @chillclaw/desktop-ui`.
- [ ] Run `swift test --package-path apps/shared/ChillClawKit`.
- [ ] Run `swift test --package-path apps/macos-native`.
- [ ] If failures appear, fix them with the same red-green loop before summarizing.
