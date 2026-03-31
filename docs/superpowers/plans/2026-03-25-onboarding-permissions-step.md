# Onboarding Permissions Step Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared `permissions` onboarding step, implement real macOS permission management with reusable UI, and reuse that UI in Settings.

**Architecture:** Extend the shared onboarding step contract so daemon, web, and native clients agree on the flow. Keep permission detection and prompting native to macOS, then expose it through reusable SwiftUI views consumed by both onboarding and settings while the web client stays aligned with an informational fallback.

**Tech Stack:** TypeScript, SwiftUI, Swift Testing, Vitest, macOS privacy APIs

---

## Chunk 1: Shared Onboarding Step Contract

### Task 1: Add the shared `permissions` onboarding step

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Models.swift`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Requests.swift`
- Modify: `apps/daemon/src/services/state-store.ts`
- Modify: `apps/daemon/src/services/onboarding-service.test.ts`
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/OnboardingTests.swift`

- [ ] **Step 1: Write the failing tests**

Add assertions that onboarding step ordering now includes `permissions` after `install`, and that persisted draft transitions can target `permissions`.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- apps/daemon/src/services/onboarding-service.test.ts`
Expected: FAIL because `permissions` is not yet part of the contract/state.

Run: `cd apps/macos-native && swift test --filter OnboardingTests`
Expected: FAIL because native onboarding step expectations still use the old order.

- [ ] **Step 3: Implement the minimal shared contract changes**

Update the onboarding step unions/enums and default ordering helpers so all shared consumers understand `permissions`.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npm test -- apps/daemon/src/services/onboarding-service.test.ts`
Expected: PASS

Run: `cd apps/macos-native && swift test --filter OnboardingTests`
Expected: PASS for the new ordering assertions.

## Chunk 2: Native Permission Infrastructure and Reusable UI

### Task 2: Port macOS permission logic and build reusable permission views

**Files:**
- Create: `apps/macos-native/Sources/ChillClawNative/PermissionSupport.swift`
- Create: `apps/macos-native/Sources/ChillClawNative/PermissionsView.swift`
- Modify: `apps/macos-native/Package.swift`
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/OnboardingTests.swift`
- Modify: `scripts/build-macos-installer.mjs`

- [ ] **Step 1: Write the failing tests**

Add focused native tests for permission metadata order/labels and any pure helper behavior introduced for reusable permission rows and monitoring support.

- [ ] **Step 2: Run the focused native test target to verify it fails**

Run: `cd apps/macos-native && swift test --filter OnboardingTests`
Expected: FAIL because the new permission helpers/components do not exist.

- [ ] **Step 3: Implement the native permission layer**

Port the OpenClaw-style permission manager/monitoring support into ChillClaw native, define reusable permission metadata, and add shared SwiftUI row/list components for onboarding and settings. Add macOS usage-description keys in the generated `Info.plist`.

- [ ] **Step 4: Run the focused native tests to verify they pass**

Run: `cd apps/macos-native && swift test --filter OnboardingTests`
Expected: PASS

## Chunk 3: Native Onboarding and Settings Integration

### Task 3: Insert the permissions step into native onboarding and reuse it in settings

**Files:**
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingSupport.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingView.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingViewModel.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/Screens.swift`
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/OnboardingTests.swift`

- [ ] **Step 1: Write the failing tests**

Add/adjust native onboarding tests so progress labels, step order, and back/next transitions reflect the inserted permissions step and settings can render the reusable permissions section.

- [ ] **Step 2: Run the focused native tests to verify they fail**

Run: `cd apps/macos-native && swift test --filter OnboardingTests`
Expected: FAIL because onboarding/settings are still wired to the old flow.

- [ ] **Step 3: Implement the integration**

Insert the permissions step after install, monitor permission status only while that surface is visible, and render the same reusable permission section inside Settings.

- [ ] **Step 4: Run the focused native tests to verify they pass**

Run: `cd apps/macos-native && swift test --filter OnboardingTests`
Expected: PASS

## Chunk 4: Web Alignment

### Task 4: Keep the React onboarding flow aligned with the shared step

**Files:**
- Modify: `apps/desktop-ui/src/features/onboarding/copy.ts`
- Modify: `apps/desktop-ui/src/features/onboarding/helpers.ts`
- Modify: `apps/desktop-ui/src/features/onboarding/helpers.test.ts`
- Modify: `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`

- [ ] **Step 1: Write the failing tests**

Add helper expectations for the new step ordering and any progress calculations that depend on total step count.

- [ ] **Step 2: Run the focused web tests to verify they fail**

Run: `npm test -- apps/desktop-ui/src/features/onboarding/helpers.test.ts`
Expected: FAIL because the helper expectations still reflect the old flow.

- [ ] **Step 3: Implement the minimal web alignment**

Update web step order, copy, and render an informational permissions step that explains macOS permissions are requested in the native app while preserving aligned onboarding progress.

- [ ] **Step 4: Run the focused web tests to verify they pass**

Run: `npm test -- apps/desktop-ui/src/features/onboarding/helpers.test.ts`
Expected: PASS

## Chunk 5: Final Verification

### Task 5: Verify the integrated change set

**Files:**
- Modify only if verification uncovers issues in files above.

- [ ] **Step 1: Run the changed native test suite**

Run: `cd apps/macos-native && swift test --filter OnboardingTests`
Expected: PASS

- [ ] **Step 2: Run the changed JS/TS test suite**

Run: `npm test -- apps/daemon/src/services/onboarding-service.test.ts apps/desktop-ui/src/features/onboarding/helpers.test.ts`
Expected: PASS

- [ ] **Step 3: Run the relevant builds**

Run: `npm run build`
Expected: PASS

Run: `cd apps/macos-native && swift build`
Expected: PASS

- [ ] **Step 4: Review changed files for scope**

Run: `git diff --stat`
Expected: Only the onboarding/contracts/native permission/settings/build-plist files and the saved plan file are changed for this feature.
