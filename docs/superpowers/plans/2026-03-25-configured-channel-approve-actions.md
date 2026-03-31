# Configured Channel Approve Actions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable configured-channel action block so every pairing-capable configured channel exposes an explicit approve action from the channel card.

**Architecture:** Keep the daemon and contracts unchanged. Add a small helper plus card action UI in the web config page, and route the new button into the existing channel dialog so approval continues through the current pairing flow.

**Tech Stack:** React 19, TypeScript, Vitest, Vite

---

### Task 1: Test the configured-channel action state

**Files:**
- Modify: `apps/desktop-ui/src/features/config/ConfigPage.test.tsx`
- Modify: `apps/desktop-ui/src/features/config/ConfigPage.tsx`

- [ ] **Step 1: Write the failing helper tests**
- [ ] **Step 2: Run `npm test --workspace @chillclaw/desktop-ui -- ConfigPage.test.tsx` to verify they fail**
- [ ] **Step 3: Implement the minimal helper state for edit vs. approve actions**
- [ ] **Step 4: Re-run the focused test and verify it passes**

### Task 2: Render the approve action on configured channel cards

**Files:**
- Modify: `apps/desktop-ui/src/features/config/ConfigPage.tsx`
- Modify: `apps/desktop-ui/src/shared/i18n/messages.ts`

- [ ] **Step 1: Add a reusable configured-channel action block to the channel card**
- [ ] **Step 2: Open the existing channel dialog when the new approve action is clicked**
- [ ] **Step 3: Add copy for the new approve action label**
- [ ] **Step 4: Run `npm test --workspace @chillclaw/desktop-ui`**
- [ ] **Step 5: Run `npm run build --workspace @chillclaw/desktop-ui`**
