# Minimal Edge-to-Edge Chat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the ChillClaw chat screen to match the approved minimal reference layout in both the React desktop UI and the macOS native app.

**Architecture:** Keep existing chat data flow and behaviors intact, but replace the card-heavy presentation with a slim collapsible left rail and a full-height conversation surface. Add tiny layout helpers and regression tests first so both clients share the same structural rules before the visual rewrite.

**Tech Stack:** React, TypeScript, Vitest, CSS, SwiftUI, Swift Testing

---

## Chunk 1: Shared Layout Rules

### Task 1: Codify left-rail layout helpers

**Files:**
- Modify: `apps/desktop-ui/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop-ui/src/features/chat/ChatPage.test.tsx`
- Modify: `apps/macos-native/Sources/ChillClawNative/Screens.swift`
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/ChatPresentationTests.swift`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run the focused tests to verify they fail for the new helper behavior**
- [ ] **Step 3: Add the minimal helper implementations**
- [ ] **Step 4: Run the focused tests to verify they pass**

## Chunk 2: React Desktop UI

### Task 2: Replace card-heavy chat chrome with the approved minimal layout

**Files:**
- Modify: `apps/desktop-ui/src/features/chat/ChatPage.tsx`
- Modify: `apps/desktop-ui/src/shared/styles/pages.css`

- [ ] **Step 1: Add a failing React helper expectation if needed for any new layout state**
- [ ] **Step 2: Implement the slim left rail, minimal transcript header, edge-to-edge transcript, and docked composer**
- [ ] **Step 3: Verify focused chat tests**

## Chunk 3: macOS Native

### Task 3: Mirror the same structure in the SwiftUI chat screen

**Files:**
- Modify: `apps/macos-native/Sources/ChillClawNative/Screens.swift`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawChatUI/ChatViewModel.swift`

- [ ] **Step 1: Add the failing native tests for helper behavior**
- [ ] **Step 2: Implement the minimal left rail, edge-to-edge detail surface, and updated transcript/composer styling**
- [ ] **Step 3: Run focused native tests**

## Chunk 4: Verification

### Task 4: Prove the redesign works

**Files:**
- Verify only

- [ ] **Step 1: Run the focused React chat tests**
- [ ] **Step 2: Run the focused native chat tests**
- [ ] **Step 3: Run the desktop build**
- [ ] **Step 4: Run the macOS package tests/build entry point if available**
- [ ] **Step 5: Report results, including any unrelated pre-existing failures**
