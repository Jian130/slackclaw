# WeChat Workflow Split Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current `wechat` path into distinct `wechat-work` and `wechat` features, migrate existing WeCom state safely, and add a daemon-owned feature workflow layer that supports plugin-backed and external-installer-backed channel setup flows.

**Architecture:** Keep the existing daemon-owned OpenClaw plugin manager, but move it under a broader daemon-owned feature workflow orchestration layer. Reuse the current `ChannelSession` transport for channel QR/login flows in this pass, and keep the new workflow layer internally generic so later model workflows can add different prerequisites without reworking clients again.

**Tech Stack:** TypeScript, Node.js, React 19, Vitest, SwiftUI, Swift Testing, shared ChillClaw contracts, local daemon services

---

## File Map

**Shared contracts and protocol**

- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Models.swift`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/EventModels.swift`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Requests.swift`
- Modify: `apps/shared/ChillClawKit/Tests/ChillClawKitTests/ChillClawProtocolTests.swift`
- Modify: `apps/shared/ChillClawKit/Tests/ChillClawKitTests/OnboardingClientTests.swift`

**Daemon config, migration, and workflow orchestration**

- Create: `apps/daemon/src/config/managed-features.ts`
- Modify: `apps/daemon/src/config/managed-plugins.ts`
- Modify: `apps/daemon/src/config/onboarding-config.ts`
- Create: `apps/daemon/src/services/feature-workflow-service.ts`
- Create: `apps/daemon/src/services/feature-workflow-service.test.ts`
- Modify: `apps/daemon/src/services/channel-setup-service.ts`
- Modify: `apps/daemon/src/services/channel-setup-service.test.ts`
- Modify: `apps/daemon/src/services/onboarding-service.test.ts`
- Modify: `apps/daemon/src/services/overview-service.ts`
- Modify: `apps/daemon/src/services/state-store.ts`
- Create: `apps/daemon/src/services/state-store.test.ts`
- Modify: `apps/daemon/src/server.ts`
- Modify: `apps/daemon/src/server.test.ts`

**Daemon engine and runtime integration**

- Modify: `apps/daemon/src/engine/adapter.ts`
- Modify: `apps/daemon/src/engine/openclaw-config-manager.ts`
- Modify: `apps/daemon/src/engine/openclaw-gateway-manager.ts`
- Modify: `apps/daemon/src/engine/openclaw-plugin-manager.ts`
- Modify: `apps/daemon/src/engine/openclaw-adapter.ts`
- Modify: `apps/daemon/src/engine/openclaw-adapter.test.ts`
- Modify: `apps/daemon/src/engine/mock-adapter.ts`
- Modify: `apps/daemon/src/engine/mock-adapter.test.ts`
- Modify: `apps/daemon/src/platform/secrets-adapter.ts`

**React web client**

- Modify: `apps/desktop-ui/src/features/onboarding/helpers.ts`
- Modify: `apps/desktop-ui/src/features/onboarding/helpers.test.ts`
- Modify: `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`
- Modify: `apps/desktop-ui/src/features/config/ConfigPage.tsx`
- Modify: `apps/desktop-ui/src/features/config/ConfigPage.test.tsx`
- Modify: `apps/desktop-ui/src/shared/api/client.ts`
- Modify: `apps/desktop-ui/src/shared/i18n/messages.ts`
- Modify: `apps/desktop-ui/src/features/plugins/PluginsPage.tsx`
- Modify: `apps/desktop-ui/src/features/plugins/PluginsPage.test.tsx`

**Native macOS client**

- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingSupport.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingViewModel.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingView.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/Screens.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/ConfigurationSupport.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/AppState.swift`
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/OnboardingTests.swift`
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/ConfigurationScreenTests.swift`
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/AppStateEventTests.swift`

---

## Chunk 1: Shared Channel Identity And Persisted-State Migration

### Task 1: Add failing shared contract tests for the channel split

**Files:**
- Modify: `packages/contracts/src/index.test.ts`
- Modify: `apps/shared/ChillClawKit/Tests/ChillClawKitTests/ChillClawProtocolTests.swift`
- Modify: `apps/shared/ChillClawKit/Tests/ChillClawKitTests/OnboardingClientTests.swift`

- [ ] **Step 1: Add a failing TypeScript contract test that expects `SupportedChannelId`-backed payloads to accept both `wechat-work` and `wechat`**
- [ ] **Step 2: Add a failing TypeScript contract test that expects onboarding channel setup kinds to distinguish WeChat Work from personal WeChat**
- [ ] **Step 3: Add a failing Swift protocol decoding test that expects the onboarding payload to decode both channel ids and both setup kinds**
- [ ] **Step 4: Run `npm test --workspace @chillclaw/contracts` and verify the new contract assertions fail**
- [ ] **Step 5: Run `swift test --package-path apps/shared/ChillClawKit --filter ChillClawProtocolTests` and verify the new Swift decoding assertions fail**

### Task 2: Implement the shared contract split

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Models.swift`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/EventModels.swift`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Requests.swift`

- [ ] **Step 1: Change `SupportedChannelId` so it includes both `wechat-work` and `wechat`**
- [ ] **Step 2: Update onboarding channel theme and setup-kind types so WeChat Work and personal WeChat are distinct products**
- [ ] **Step 3: Rename the current WeChat Work request shape so it no longer exposes `corpId` in the shared contract and instead carries `botId` and `secret`**
- [ ] **Step 4: Update Swift protocol models and request types to match the TypeScript contract changes**
- [ ] **Step 5: Re-run `npm test --workspace @chillclaw/contracts` and verify the contracts pass**
- [ ] **Step 6: Re-run `swift test --package-path apps/shared/ChillClawKit --filter ChillClawProtocolTests` and verify the protocol tests pass**

### Task 3: Add failing migration tests for old `wechat` state

**Files:**
- Create: `apps/daemon/src/services/state-store.test.ts`
- Modify: `apps/daemon/src/services/onboarding-service.test.ts`

- [ ] **Step 1: Add a failing `StateStore` test that loads persisted `channelOnboarding` state containing `wechat` and expects it to be normalized to `wechat-work`**
- [ ] **Step 2: Add a failing onboarding-service test that expects daemon-owned onboarding metadata to list both `wechat-work` and `wechat`**
- [ ] **Step 3: Run `node --import tsx --test apps/daemon/src/services/state-store.test.ts apps/daemon/src/services/onboarding-service.test.ts` and verify the migration assertions fail**

### Task 4: Implement onboarding metadata and persisted-state migration

**Files:**
- Modify: `apps/daemon/src/config/onboarding-config.ts`
- Modify: `apps/daemon/src/services/state-store.ts`

- [ ] **Step 1: Split the onboarding channel metadata into separate WeChat Work and WeChat entries with distinct ids, labels, descriptions, themes, and setup kinds**
- [ ] **Step 2: Add a state-store migration that rewrites persisted channel ids and entry ids from old `wechat` to `wechat-work`**
- [ ] **Step 3: Make sure migration preserves entry values, timestamps, and onboarding progress instead of resetting them**
- [ ] **Step 4: Re-run `node --import tsx --test apps/daemon/src/services/state-store.test.ts apps/daemon/src/services/onboarding-service.test.ts` and verify the migration tests pass**
- [ ] **Step 5: Commit this chunk**

```bash
git add packages/contracts/src/index.ts packages/contracts/src/index.test.ts \
  apps/shared/ChillClawKit/Sources/ChillClawProtocol/Models.swift \
  apps/shared/ChillClawKit/Sources/ChillClawProtocol/EventModels.swift \
  apps/shared/ChillClawKit/Sources/ChillClawProtocol/Requests.swift \
  apps/shared/ChillClawKit/Tests/ChillClawKitTests/ChillClawProtocolTests.swift \
  apps/shared/ChillClawKit/Tests/ChillClawKitTests/OnboardingClientTests.swift \
  apps/daemon/src/config/onboarding-config.ts \
  apps/daemon/src/services/state-store.ts \
  apps/daemon/src/services/state-store.test.ts \
  apps/daemon/src/services/onboarding-service.test.ts
git commit -m "refactor: split wechat channel identities"
```

---

## Chunk 2: Daemon Feature Workflow Orchestration

### Task 5: Add failing daemon tests for managed feature orchestration

**Files:**
- Create: `apps/daemon/src/services/feature-workflow-service.test.ts`
- Modify: `apps/daemon/src/services/channel-setup-service.test.ts`
- Modify: `apps/daemon/src/services/plugin-service.test.ts`

- [ ] **Step 1: Add a failing workflow-service test for a plugin-backed feature (`channel:wechat-work`) that expects plugin prerequisites to delegate to the existing plugin manager**
- [ ] **Step 2: Add a failing workflow-service test for an external-installer-backed feature (`channel:wechat`) that expects the external installer command to be queued without pretending it is a plugin**
- [ ] **Step 3: Add a failing channel-setup-service test that expects WeChat Work and personal WeChat to go through different setup paths**
- [ ] **Step 4: Add a failing plugin-service test that expects only true plugin-backed managed features to appear in the plugin overview**
- [ ] **Step 5: Run `node --import tsx --test apps/daemon/src/services/feature-workflow-service.test.ts apps/daemon/src/services/channel-setup-service.test.ts apps/daemon/src/services/plugin-service.test.ts` and verify the new assertions fail**

### Task 6: Implement the managed feature registry and orchestration service

**Files:**
- Create: `apps/daemon/src/config/managed-features.ts`
- Modify: `apps/daemon/src/config/managed-plugins.ts`
- Create: `apps/daemon/src/services/feature-workflow-service.ts`
- Modify: `apps/daemon/src/services/channel-setup-service.ts`
- Modify: `apps/daemon/src/services/plugin-service.ts`

- [ ] **Step 1: Create `managed-features.ts` with separate `channel:wechat-work` and `channel:wechat` definitions, explicit setup kinds, and prerequisite definitions**
- [ ] **Step 2: Narrow `managed-plugins.ts` so it models only true OpenClaw plugin prerequisites and no longer tries to represent every feature**
- [ ] **Step 3: Create `FeatureWorkflowService` that can dispatch prerequisites by type, starting with `openclaw-plugin` and `external-installer`**
- [ ] **Step 4: Wire `ChannelSetupService` to ask the workflow service to prepare a channel feature instead of calling `managedFeatureIdForChannel()` directly**
- [ ] **Step 5: Keep `PluginService` scoped to plugin-backed features only so personal WeChat does not show up as a plugin card**
- [ ] **Step 6: Re-run `node --import tsx --test apps/daemon/src/services/feature-workflow-service.test.ts apps/daemon/src/services/channel-setup-service.test.ts apps/daemon/src/services/plugin-service.test.ts` and verify the orchestration tests pass**

### Task 7: Keep API churn minimal by reusing channel sessions for channel workflows

**Files:**
- Modify: `apps/daemon/src/services/channel-setup-service.ts`
- Modify: `apps/daemon/src/server.ts`
- Modify: `apps/daemon/src/server.test.ts`

- [ ] **Step 1: Add a failing server or channel-setup-service test that proves personal WeChat can reuse the existing channel-session endpoints instead of requiring a new public workflow-session API**
- [ ] **Step 2: Keep the public transport on `ChannelSession` for channel QR/login flows in this pass**
- [ ] **Step 3: Only add new route surface if the existing `POST /api/channels/entries` plus `/api/channels/session/*` endpoints cannot represent the WeChat QR-first flow cleanly**
- [ ] **Step 4: Re-run `node --import tsx --test apps/daemon/src/server.test.ts apps/daemon/src/services/channel-setup-service.test.ts` and verify the smaller route surface still passes**
- [ ] **Step 5: Commit this chunk**

```bash
git add apps/daemon/src/config/managed-features.ts \
  apps/daemon/src/config/managed-plugins.ts \
  apps/daemon/src/services/feature-workflow-service.ts \
  apps/daemon/src/services/feature-workflow-service.test.ts \
  apps/daemon/src/services/channel-setup-service.ts \
  apps/daemon/src/services/channel-setup-service.test.ts \
  apps/daemon/src/services/plugin-service.ts \
  apps/daemon/src/services/plugin-service.test.ts \
  apps/daemon/src/server.ts \
  apps/daemon/src/server.test.ts
git commit -m "feat: add daemon feature workflow orchestration"
```

---

## Chunk 3: Daemon Runtime Integration For WeChat Work And Personal WeChat

### Task 8: Add failing daemon tests for the WeChat Work rename and field change

**Files:**
- Modify: `apps/daemon/src/engine/openclaw-adapter.test.ts`
- Modify: `apps/daemon/src/engine/mock-adapter.test.ts`

- [ ] **Step 1: Add a failing adapter test that expects old persisted `wechat` state to read back as `wechat-work`**
- [ ] **Step 2: Add a failing adapter test that expects WeChat Work setup to succeed with `botId` and `secret` and not require `corpId`**
- [ ] **Step 3: Add a failing mock-adapter test that expects `wechat-work` to be the managed WeCom feature and `wechat` to remain distinct**
- [ ] **Step 4: Run `node --import tsx --test apps/daemon/src/engine/openclaw-adapter.test.ts apps/daemon/src/engine/mock-adapter.test.ts` and verify the new assertions fail**

### Task 9: Implement WeChat Work as `wechat-work`

**Files:**
- Modify: `apps/daemon/src/engine/adapter.ts`
- Modify: `apps/daemon/src/engine/openclaw-config-manager.ts`
- Modify: `apps/daemon/src/engine/openclaw-gateway-manager.ts`
- Modify: `apps/daemon/src/engine/openclaw-adapter.ts`
- Modify: `apps/daemon/src/engine/mock-adapter.ts`
- Modify: `apps/daemon/src/services/channel-setup-service.ts`
- Modify: `apps/daemon/src/services/overview-service.ts`
- Modify: `apps/daemon/src/platform/secrets-adapter.ts`

- [ ] **Step 1: Rename every existing WeCom-backed channel branch from `wechat` to `wechat-work` across adapter, config manager, gateway manager, overview, and state helpers**
- [ ] **Step 2: Change the WeChat Work request mapping so visible inputs are `botId` and `secret`**
- [ ] **Step 3: Remove `corpId` from WeChat Work validation, editable values, summaries, and secret persistence**
- [ ] **Step 4: Keep the managed plugin prerequisite mapped to `channel:wechat-work` and `@wecom/wecom-openclaw-plugin`**
- [ ] **Step 5: Re-run `node --import tsx --test apps/daemon/src/engine/openclaw-adapter.test.ts apps/daemon/src/engine/mock-adapter.test.ts apps/daemon/src/services/channel-setup-service.test.ts` and verify the WeChat Work tests pass**

### Task 10: Add failing daemon tests for personal WeChat installer and QR session flow

**Files:**
- Modify: `apps/daemon/src/engine/openclaw-adapter.test.ts`
- Modify: `apps/daemon/src/engine/mock-adapter.test.ts`
- Modify: `apps/daemon/src/services/channel-setup-service.test.ts`

- [ ] **Step 1: Add a failing adapter test that expects personal WeChat to invoke `npx -y @tencent-weixin/openclaw-weixin-cli@latest install` instead of `openclaw plugins install ...`**
- [ ] **Step 2: Add a failing adapter test that expects personal WeChat setup to start a `ChannelSession` with QR-first logs instead of saving credential fields**
- [ ] **Step 3: Add a failing mock-adapter or channel-setup-service test that expects WeChat personal to reuse channel session polling and input plumbing**
- [ ] **Step 4: Run `node --import tsx --test apps/daemon/src/engine/openclaw-adapter.test.ts apps/daemon/src/engine/mock-adapter.test.ts apps/daemon/src/services/channel-setup-service.test.ts` and verify the personal WeChat assertions fail**

### Task 11: Implement personal WeChat QR-first flow

**Files:**
- Modify: `apps/daemon/src/engine/openclaw-adapter.ts`
- Modify: `apps/daemon/src/engine/mock-adapter.ts`
- Modify: `apps/daemon/src/services/channel-setup-service.ts`

- [ ] **Step 1: Add a daemon-managed external installer path that runs `npx -y @tencent-weixin/openclaw-weixin-cli@latest install` for `channel:wechat`**
- [ ] **Step 2: Reuse the current `ChannelSession` transport for personal WeChat, following the WhatsApp pattern of streaming logs and session status**
- [ ] **Step 3: Start personal WeChat setup through the channel workflow path with no manual fields required in the default onboarding flow**
- [ ] **Step 4: If the installer exposes only human-readable QR output, stream it into `ChannelSession.logs` first instead of inventing a new QR payload contract**
- [ ] **Step 5: Only extend `ChannelSession` with QR-specific fields if a stable machine-readable payload becomes necessary during implementation**
- [ ] **Step 6: Re-run `node --import tsx --test apps/daemon/src/engine/openclaw-adapter.test.ts apps/daemon/src/engine/mock-adapter.test.ts apps/daemon/src/services/channel-setup-service.test.ts apps/daemon/src/server.test.ts` and verify the installer and session tests pass**
- [ ] **Step 7: Commit this chunk**

```bash
git add apps/daemon/src/engine/adapter.ts \
  apps/daemon/src/engine/openclaw-config-manager.ts \
  apps/daemon/src/engine/openclaw-gateway-manager.ts \
  apps/daemon/src/engine/openclaw-plugin-manager.ts \
  apps/daemon/src/engine/openclaw-adapter.ts \
  apps/daemon/src/engine/openclaw-adapter.test.ts \
  apps/daemon/src/engine/mock-adapter.ts \
  apps/daemon/src/engine/mock-adapter.test.ts \
  apps/daemon/src/services/channel-setup-service.ts \
  apps/daemon/src/services/channel-setup-service.test.ts \
  apps/daemon/src/services/overview-service.ts \
  apps/daemon/src/platform/secrets-adapter.ts
git commit -m "feat: split wechat-work and personal wechat flows"
```

---

## Chunk 4: React Web Client Split

### Task 12: Add failing web tests for onboarding and config distinction

**Files:**
- Modify: `apps/desktop-ui/src/features/onboarding/helpers.test.ts`
- Modify: `apps/desktop-ui/src/features/config/ConfigPage.test.tsx`
- Modify: `apps/desktop-ui/src/features/plugins/PluginsPage.test.tsx`

- [ ] **Step 1: Add a failing onboarding-helper test that expects the curated channel list to include both `wechat-work` and `wechat`**
- [ ] **Step 2: Add a failing onboarding-helper test that expects WeChat Work hidden save values to carry `botId` and `secret` semantics and no `corpId`**
- [ ] **Step 3: Add a failing config-page test that expects WeChat Work and WeChat to render distinct actions, with WeChat personal using login/session behavior instead of a credential form**
- [ ] **Step 4: Add a failing plugins-page test that expects only WeChat Work to remain in the plugin screen**
- [ ] **Step 5: Run `npm test --workspace @chillclaw/desktop-ui -- src/features/onboarding/helpers.test.ts src/features/config/ConfigPage.test.tsx src/features/plugins/PluginsPage.test.tsx` and verify the new assertions fail**

### Task 13: Implement the React onboarding and config split

**Files:**
- Modify: `apps/desktop-ui/src/features/onboarding/helpers.ts`
- Modify: `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`
- Modify: `apps/desktop-ui/src/features/config/ConfigPage.tsx`
- Modify: `apps/desktop-ui/src/shared/api/client.ts`
- Modify: `apps/desktop-ui/src/shared/i18n/messages.ts`
- Modify: `apps/desktop-ui/src/features/plugins/PluginsPage.tsx`

- [ ] **Step 1: Update onboarding helper logic to recognize `wechat-work-guided` and `wechat-guided` as different setup variants**
- [ ] **Step 2: Update the WeChat Work onboarding form to show `Bot ID` and `Secret` only**
- [ ] **Step 3: Add a QR-first personal WeChat onboarding card that starts the channel workflow without manual fields**
- [ ] **Step 4: Update the config dialog so WeChat Work remains form-based while WeChat personal is login/session based**
- [ ] **Step 5: Update API helpers and UI copy to use the renamed ids and labels consistently**
- [ ] **Step 6: Keep the plugins page scoped to WeChat Work and other true plugins only**
- [ ] **Step 7: Re-run `npm test --workspace @chillclaw/desktop-ui -- src/features/onboarding/helpers.test.ts src/features/config/ConfigPage.test.tsx src/features/plugins/PluginsPage.test.tsx` and verify the web split tests pass**

### Task 14: Verify the web client end to end

**Files:**
- Modify: `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`
- Modify: `apps/desktop-ui/src/features/config/ConfigPage.tsx`
- Modify: `apps/desktop-ui/src/shared/i18n/messages.ts`

- [ ] **Step 1: Run `npm test --workspace @chillclaw/desktop-ui`**
- [ ] **Step 2: Run `npm run build --workspace @chillclaw/desktop-ui`**
- [ ] **Step 3: Manually verify the local web UI shows separate WeChat Work and WeChat onboarding cards and that only WeChat Work appears in the Plugins page**
- [ ] **Step 4: Commit this chunk**

```bash
git add apps/desktop-ui/src/features/onboarding/helpers.ts \
  apps/desktop-ui/src/features/onboarding/helpers.test.ts \
  apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx \
  apps/desktop-ui/src/features/config/ConfigPage.tsx \
  apps/desktop-ui/src/features/config/ConfigPage.test.tsx \
  apps/desktop-ui/src/shared/api/client.ts \
  apps/desktop-ui/src/shared/i18n/messages.ts \
  apps/desktop-ui/src/features/plugins/PluginsPage.tsx \
  apps/desktop-ui/src/features/plugins/PluginsPage.test.tsx
git commit -m "feat: split wechat onboarding and config flows on web"
```

---

## Chunk 5: Native macOS Client And Final Verification

### Task 15: Add failing native tests for the channel split

**Files:**
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/OnboardingTests.swift`
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/ConfigurationScreenTests.swift`
- Modify: `apps/macos-native/Tests/ChillClawNativeTests/AppStateEventTests.swift`

- [ ] **Step 1: Add a failing onboarding test that expects curated channels to include both WeChat Work and WeChat in the daemon-owned order**
- [ ] **Step 2: Add a failing onboarding test that expects WeChat Work hidden values to stop requiring `corpId`**
- [ ] **Step 3: Add a failing configuration-screen test that expects WeChat personal to use login/session behavior while WeChat Work remains credential-based**
- [ ] **Step 4: Add a failing app-state or event test if any renamed ids or session expectations need updated decoding**
- [ ] **Step 5: Run `swift test --package-path apps/macos-native --filter OnboardingTests` and verify the new native onboarding assertions fail**

### Task 16: Implement the native macOS onboarding and config split

**Files:**
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingSupport.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingViewModel.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingView.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/Screens.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/ConfigurationSupport.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/AppState.swift`

- [ ] **Step 1: Update native onboarding helpers to distinguish WeChat Work and WeChat setup kinds**
- [ ] **Step 2: Change the WeChat Work native form to `Bot ID` and `Secret` only**
- [ ] **Step 3: Add the QR-first WeChat native flow that starts setup without manual fields and surfaces session progress**
- [ ] **Step 4: Update native configuration screens and section copy to keep the two products distinct**
- [ ] **Step 5: Re-run `swift test --package-path apps/macos-native --filter OnboardingTests` and verify the onboarding split tests pass**
- [ ] **Step 6: Run `swift test --package-path apps/macos-native --filter ConfigurationScreenTests` and verify the config split tests pass**

### Task 17: Run full shared Swift and native verification

**Files:**
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawClient/APIClient.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/AppState.swift`

- [ ] **Step 1: Update any remaining Swift API client or app-state call sites to the renamed ids and session behavior**
- [ ] **Step 2: Run `swift test --package-path apps/shared/ChillClawKit`**
- [ ] **Step 3: Run `swift test --package-path apps/macos-native`**
- [ ] **Step 4: Commit this chunk**

```bash
git add apps/shared/ChillClawKit/Sources/ChillClawProtocol/Models.swift \
  apps/shared/ChillClawKit/Sources/ChillClawProtocol/EventModels.swift \
  apps/shared/ChillClawKit/Sources/ChillClawProtocol/Requests.swift \
  apps/shared/ChillClawKit/Sources/ChillClawClient/APIClient.swift \
  apps/shared/ChillClawKit/Tests/ChillClawKitTests/ChillClawProtocolTests.swift \
  apps/shared/ChillClawKit/Tests/ChillClawKitTests/OnboardingClientTests.swift \
  apps/macos-native/Sources/ChillClawNative/OnboardingSupport.swift \
  apps/macos-native/Sources/ChillClawNative/OnboardingViewModel.swift \
  apps/macos-native/Sources/ChillClawNative/OnboardingView.swift \
  apps/macos-native/Sources/ChillClawNative/Screens.swift \
  apps/macos-native/Sources/ChillClawNative/ConfigurationSupport.swift \
  apps/macos-native/Sources/ChillClawNative/AppState.swift \
  apps/macos-native/Tests/ChillClawNativeTests/OnboardingTests.swift \
  apps/macos-native/Tests/ChillClawNativeTests/ConfigurationScreenTests.swift \
  apps/macos-native/Tests/ChillClawNativeTests/AppStateEventTests.swift
git commit -m "feat: split wechat onboarding and config flows on macos"
```

### Task 18: Final cross-surface verification and rollout checks

**Files:**
- Modify: `apps/daemon/src/services/state-store.ts`
- Modify: `apps/daemon/src/engine/openclaw-adapter.ts`
- Modify: `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingView.swift`

- [ ] **Step 1: Run `npm test --workspace @chillclaw/contracts`**
- [ ] **Step 2: Run `node --import tsx --test apps/daemon/src/services/state-store.test.ts apps/daemon/src/services/feature-workflow-service.test.ts apps/daemon/src/services/channel-setup-service.test.ts apps/daemon/src/services/plugin-service.test.ts apps/daemon/src/server.test.ts apps/daemon/src/engine/openclaw-adapter.test.ts apps/daemon/src/engine/mock-adapter.test.ts`**
- [ ] **Step 3: Run `npm test --workspace @chillclaw/desktop-ui`**
- [ ] **Step 4: Run `npm run build --workspace @chillclaw/desktop-ui`**
- [ ] **Step 5: Run `swift test --package-path apps/shared/ChillClawKit`**
- [ ] **Step 6: Run `swift test --package-path apps/macos-native`**
- [ ] **Step 7: Manually verify an old saved `wechat` state is surfaced as `wechat-work` without losing data**
- [ ] **Step 8: Manually verify WeChat Work setup only asks for `Bot ID` and `Secret`**
- [ ] **Step 9: Manually verify personal WeChat starts the `npx -y @tencent-weixin/openclaw-weixin-cli@latest install` flow and enters a QR-first session**
- [ ] **Step 10: Commit any final fixes**

```bash
git add -A
git commit -m "feat: add distinct wechat-work and personal wechat workflows"
```
