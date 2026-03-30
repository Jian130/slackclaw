# Dashboard Locale Picker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the shared native locale picker from onboarding to the macOS dashboard header.

**Architecture:** Extract the onboarding-only picker into a reusable native SwiftUI view plus a small locale-selection helper, then mount that shared picker in the dashboard header and persist changes through the existing locale storage path.

**Tech Stack:** SwiftUI, Swift Testing, Swift Package Manager

---

### Task 1: Share locale picker selection logic

**Files:**
- Modify: `apps/macos-native/Tests/SlackClawNativeTests/OnboardingTests.swift`
- Modify: `apps/macos-native/Sources/SlackClawNative/OnboardingSupport.swift`

- [ ] **Step 1: Write the failing test for shared locale-option resolution**
- [ ] **Step 2: Run `swift test --package-path apps/macos-native --filter OnboardingTests/nativeLocalePickerResolvesSelectedOptionAndFallback` to verify it fails**
- [ ] **Step 3: Implement the minimal helper to resolve the selected locale option**
- [ ] **Step 4: Re-run the focused test and verify it passes**

### Task 2: Extract the reusable picker and add it to the dashboard

**Files:**
- Create: `apps/macos-native/Sources/SlackClawNative/LocalePicker.swift`
- Modify: `apps/macos-native/Sources/SlackClawNative/OnboardingView.swift`
- Modify: `apps/macos-native/Sources/SlackClawNative/Screens.swift`

- [ ] **Step 1: Move the onboarding locale picker into a reusable shared view**
- [ ] **Step 2: Replace onboarding with the shared picker**
- [ ] **Step 3: Add the shared picker to the dashboard header and persist locale changes**
- [ ] **Step 4: Run `swift test --package-path apps/macos-native`**
- [ ] **Step 5: Run `swift build --package-path apps/macos-native`**
