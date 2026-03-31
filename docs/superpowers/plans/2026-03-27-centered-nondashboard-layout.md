# Centered Non-Dashboard Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center every non-dashboard page inside a bounded shared container across the React UI and native macOS client, while keeping dashboard and split-detail layouts full width.

**Architecture:** Implement the width rule at the shared scaffold layer, not page CSS. Add a shared centered/full width mode to web and native scaffolds, add one semantic max-width contract per client, and make dashboard explicitly opt into the full-width exception path.

**Tech Stack:** React 19, TypeScript, CSS, SwiftUI, Swift Testing, Vitest

---

## Chunk 1: Web Scaffold Width Contract

### Task 1: Add failing web tests for scaffold width behavior

**Files:**
- Modify: `apps/desktop-ui/src/shared/ui/StatusBadge.test.tsx`
- Modify: `apps/desktop-ui/src/shared/ui/Scaffold.tsx`

- [ ] **Step 1: Write a failing test that renders `WorkspaceScaffold` with default props and expects the centered width class to be present**
- [ ] **Step 2: Write a failing test that renders `WorkspaceScaffold` with `contentWidth="full"` and expects the full-width class to be present instead**
- [ ] **Step 3: Write a failing test that renders `SplitContentScaffold` with default props and expects the full-width class to remain the default**
- [ ] **Step 4: Run `npm test --workspace @chillclaw/desktop-ui -- StatusBadge.test.tsx` and verify the new assertions fail for missing scaffold width behavior**

### Task 2: Implement the web scaffold width mode

**Files:**
- Modify: `apps/desktop-ui/src/shared/ui/Scaffold.tsx`
- Modify: `apps/desktop-ui/src/shared/styles/tokens.css`
- Modify: `apps/desktop-ui/src/shared/styles/layout.css`

- [ ] **Step 1: Add a shared `contentWidth` prop to `WorkspaceScaffold`, `OperationsScaffold`, and `GuidedFlowScaffold`, defaulting each to centered**
- [ ] **Step 2: Add the same prop to `SplitContentScaffold`, defaulting it to full width**
- [ ] **Step 3: Introduce a semantic web token for centered page max width in `tokens.css`**
- [ ] **Step 4: Add shared scaffold width classes in `layout.css` so centered mode uses full width plus max width and auto inline margins**
- [ ] **Step 5: Keep scaffold children left-aligned inside the centered container**
- [ ] **Step 6: Re-run `npm test --workspace @chillclaw/desktop-ui -- StatusBadge.test.tsx` and verify the scaffold width tests pass**

---

## Chunk 2: Web Screen Exceptions And Onboarding Shell

### Task 3: Apply explicit full-width exceptions to dashboard and preserve onboarding shell centering

**Files:**
- Modify: `apps/desktop-ui/src/features/dashboard/DashboardPage.tsx`
- Modify: `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`
- Modify: `apps/desktop-ui/src/shared/styles/pages.css`

- [ ] **Step 1: Write a failing assertion in an existing dashboard-focused test or add a small helper assertion proving dashboard opts into the full-width scaffold path**
- [ ] **Step 2: Update `DashboardPage` so its `WorkspaceScaffold` explicitly uses `contentWidth="full"`**
- [ ] **Step 3: Update `GuidedFlowScaffold` usage in onboarding only if needed so the outer shell is centered by scaffold while the existing onboarding shell still controls panel width**
- [ ] **Step 4: Adjust page CSS only where necessary to avoid double-centering or width conflicts with `.onboarding-shell`**
- [ ] **Step 5: Run `npm test --workspace @chillclaw/desktop-ui -- DashboardPage.test.ts` if a dashboard assertion was added, otherwise run the smallest affected desktop-ui test file**

### Task 4: Verify the web app layout contract end to end

**Files:**
- Modify: `apps/desktop-ui/src/shared/ui/Scaffold.tsx`
- Modify: `apps/desktop-ui/src/shared/styles/layout.css`
- Modify: `apps/desktop-ui/src/features/dashboard/DashboardPage.tsx`
- Modify: `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`

- [ ] **Step 1: Run `npm test --workspace @chillclaw/desktop-ui`**
- [ ] **Step 2: Run `npm run build --workspace @chillclaw/desktop-ui`**
- [ ] **Step 3: Manually verify in the local UI that deploy, config, skills, members, team, settings, and onboarding are visually centered while dashboard stays wide**

---

## Chunk 3: Native Scaffold Width Contract

### Task 5: Add failing native contract tests for centered vs full page widths

**Files:**
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/UIContractTests.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/UI/NativeUIContract.swift`

- [ ] **Step 1: Write a failing native contract test for the shared centered page max-width constant**
- [ ] **Step 2: Write a failing native contract test for the scaffold width-mode defaults if the mode is exposed as a helper or enum**
- [ ] **Step 3: Run `swift test --package-path apps/macos-native --filter UIContractTests` and verify the new assertions fail**

### Task 6: Implement the native scaffold width mode

**Files:**
- Modify: `apps/macos-native/Sources/ChillClawNative/UI/NativeUIContract.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/UI/NativeUIScaffolds.swift`

- [ ] **Step 1: Add a semantic native centered page max-width constant to `NativeUI`**
- [ ] **Step 2: Add a small native layout mode enum or equivalent max-width parameter for scaffolds**
- [ ] **Step 3: Make `WorkspaceScaffold`, `OperationsScaffold`, and `GuidedFlowScaffold` default to centered mode**
- [ ] **Step 4: Keep `SplitContentScaffold` on the existing full-width path**
- [ ] **Step 5: Center the bounded scaffold block while preserving leading alignment inside it**
- [ ] **Step 6: Re-run `swift test --package-path apps/macos-native --filter UIContractTests` and verify the native contract tests pass**

---

## Chunk 4: Native Dashboard Exception And Full Verification

### Task 7: Make native dashboard explicitly full width

**Files:**
- Modify: `apps/macos-native/Sources/ChillClawNative/Screens.swift`
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/DashboardSupportTests.swift`

- [ ] **Step 1: Add a failing dashboard-focused native assertion if a helper or explicit width mode can be tested cleanly**
- [ ] **Step 2: Update both native dashboard `WorkspaceScaffold` call sites to use the full-width mode explicitly**
- [ ] **Step 3: Re-run `swift test --package-path apps/macos-native --filter DashboardSupportTests` if a dashboard assertion was added**

### Task 8: Verify the native client and repository-level layout change

**Files:**
- Modify: `apps/macos-native/Sources/ChillClawNative/UI/NativeUIScaffolds.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/Screens.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/UI/NativeUIContract.swift`

- [ ] **Step 1: Run `swift test --package-path apps/macos-native`**
- [ ] **Step 2: Run `npm run build:mac-native`**
- [ ] **Step 3: Manually verify macOS onboarding, deploy, config, skills, members, team, settings, dashboard, and chat so the non-dashboard screens are centered and dashboard/chat remain wide**
