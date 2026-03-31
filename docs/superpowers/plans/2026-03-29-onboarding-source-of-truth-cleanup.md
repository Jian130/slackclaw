# Onboarding Source Of Truth Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daemon the single source of truth for onboarding employee preset data by shrinking onboarding config to preset IDs, merging managed skill definitions into the AI member preset catalog, and removing client-local onboarding preset ownership and preset-backed member request synthesis.

**Architecture:** `onboarding-config.ts` keeps only curated onboarding selections, while `ai-member-presets.ts` owns the full preset bodies plus the managed skill catalog that runtime services install or verify. `OnboardingService` resolves the client-facing onboarding preset presentations and the preset-backed fields needed for onboarding AI member creation, and the web and native clients render those resolved presentations instead of carrying local onboarding preset or avatar definitions.

**Tech Stack:** TypeScript, Node.js, Swift, SwiftUI, shared contract models, Node test runner, Vitest, Swift Testing

---

## File Map

- Modify: `apps/daemon/src/config/onboarding-config.ts`
- Modify: `apps/daemon/src/config/ai-member-presets.ts`
- Delete: `apps/daemon/src/config/preset-skill-definitions.ts`
- Modify: `apps/daemon/src/services/preset-skill-service.ts`
- Modify: `apps/daemon/src/services/onboarding-service.ts`
- Modify: `apps/daemon/src/services/state-store.ts`
- Modify: `apps/daemon/src/services/ai-team-service.ts`
- Modify: `apps/daemon/src/services/onboarding-service.test.ts`
- Modify: `apps/daemon/src/services/preset-skill-service.test.ts`
- Modify: `apps/daemon/src/services/state-store.test.ts`
- Modify: `apps/daemon/src/services/ai-team-service.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Models.swift`
- Modify: `apps/shared/ChillClawKit/Tests/ChillClawKitTests/ChillClawProtocolTests.swift`
- Modify: `apps/shared/ChillClawKit/Tests/ChillClawKitTests/OnboardingClientTests.swift`
- Modify: `apps/desktop-ui/src/features/onboarding/helpers.ts`
- Modify: `apps/desktop-ui/src/features/onboarding/helpers.test.ts`
- Modify: `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingSupport.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingViewModel.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingView.swift`
- Modify if behavior or ownership docs change during implementation: `README.md`, `docs/reference/onboarding-design.md`

## Chunk 1: Daemon Catalog Consolidation

### Task 1: Merge managed skill definitions into the AI member preset catalog

**Files:**
- Modify: `apps/daemon/src/config/ai-member-presets.ts`
- Delete: `apps/daemon/src/config/preset-skill-definitions.ts`
- Modify: `apps/daemon/src/services/preset-skill-service.ts`
- Modify: `apps/daemon/src/services/ai-team-service.ts`
- Modify: `apps/daemon/src/services/state-store.ts`
- Test: `apps/daemon/src/services/preset-skill-service.test.ts`
- Test: `apps/daemon/src/services/ai-team-service.test.ts`
- Test: `apps/daemon/src/services/state-store.test.ts`

- [ ] **Step 1: Inventory imports from the old preset skill file**

Run: `rg -n "presetSkillDefinitions|presetSkillDefinitionById|normalizePresetSkillIds" apps/daemon/src`

Expected: every daemon dependency on `preset-skill-definitions.ts` is identified before code moves.

- [ ] **Step 2: Add a daemon-owned managed skill catalog export to `ai-member-presets.ts`**

Include the current managed skill metadata there instead of duplicating labels, descriptions, runtime slugs, and bundled asset paths across multiple files.

- [ ] **Step 3: Move preset skill helper functions into `ai-member-presets.ts`**

Port `presetSkillDefinitionById`, `presetSkillDefinitionByRuntimeSlug`, and `normalizePresetSkillIds` so the daemon keeps one import surface.

- [ ] **Step 4: Repoint daemon services to the merged helpers**

Update `preset-skill-service.ts`, `ai-team-service.ts`, and `state-store.ts` to import from `ai-member-presets.ts`.

- [ ] **Step 5: Delete `preset-skill-definitions.ts` and update daemon tests**

Run: `npm test --workspace @chillclaw/daemon`

Expected: the daemon test suite passes with no remaining imports from the deleted file.

- [ ] **Step 6: Commit**

Run: `git commit -m "refactor: merge managed onboarding skills into ai member presets"`

### Task 2: Make onboarding config selector-only for employee presets

**Files:**
- Modify: `apps/daemon/src/config/onboarding-config.ts`
- Modify: `apps/daemon/src/services/onboarding-service.ts`
- Test: `apps/daemon/src/services/onboarding-service.test.ts`

- [ ] **Step 1: Replace full onboarding employee preset objects with preset IDs**

Change `onboarding-config.ts` so it stores only the curated employee preset order for onboarding.

- [ ] **Step 2: Add a resolver in `OnboardingService`**

Resolve onboarding preset IDs against `ai-member-presets.ts` and return the full presentation objects in `OnboardingStateResponse`.

- [ ] **Step 3: Fail fast on missing preset references**

If onboarding config points at a preset ID that does not exist, make the daemon surface that clearly during tests instead of silently dropping it.

- [ ] **Step 4: Keep model and channel config unchanged in this slice**

Do not widen scope yet; this task is only about employee preset ownership.

- [ ] **Step 5: Add a daemon-side preset resolver for later onboarding member creation**

Make sure the daemon has one place to translate `presetId` into preset-backed fields so client onboarding flows can stop building that request shape themselves.

- [ ] **Step 6: Update onboarding service tests**

Run: `npm test --workspace @chillclaw/daemon`

Expected: onboarding tests cover resolved preset order and missing-ID failures.

- [ ] **Step 7: Commit**

Run: `git commit -m "refactor: resolve onboarding employee presets from daemon catalog"`

### Task 3: Extend the shared onboarding preset presentation with any missing display fields

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Models.swift`
- Modify: `apps/shared/ChillClawKit/Tests/ChillClawKitTests/ChillClawProtocolTests.swift`
- Modify: `apps/shared/ChillClawKit/Tests/ChillClawKitTests/OnboardingClientTests.swift`

- [ ] **Step 1: Identify which preset presentation fields clients still need to render directly**

Most likely this is `avatarPresetId`, because avatar ownership is currently client-local.

- [ ] **Step 2: Update `OnboardingEmployeePresetPresentation` in the shared contracts**

Only add fields that are strictly necessary for client rendering. Do not leak full runtime config to clients.

- [ ] **Step 3: Update the Swift protocol mirror**

Keep `Models.swift` aligned with the contract shape so native renders the resolved daemon response without extra local fallback data.

- [ ] **Step 4: Update contract and client decoding tests**

Run: `npm test --workspace @chillclaw/contracts`

Expected: contract serialization tests pass with the expanded onboarding preset presentation.

- [ ] **Step 5: Run shared Swift tests**

Run: `swift test --package-path apps/shared/ChillClawKit`

Expected: protocol and onboarding client decoding tests pass.

- [ ] **Step 6: Commit**

Run: `git commit -m "refactor: expose daemon-owned onboarding preset presentation"`

## Chunk 2: Client Cleanup

### Task 4: Remove web onboarding’s local preset and avatar ownership

**Files:**
- Modify: `apps/desktop-ui/src/features/onboarding/helpers.ts`
- Modify: `apps/desktop-ui/src/features/onboarding/helpers.test.ts`
- Modify: `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`

- [ ] **Step 1: Remove web onboarding preset composition logic from `helpers.ts`**

Keep only display helpers that operate on daemon-resolved onboarding state.

- [ ] **Step 2: Stop filtering onboarding avatar presets locally in `OnboardingPage.tsx`**

Render preset avatar data from the daemon response once the shared contract carries it.

- [ ] **Step 3: Remove client-side synthesis of onboarding preset-backed fields**

The web layer should no longer invent preset internals that belong to the daemon catalog, including `buildOnboardingMemberRequest`-style preset-backed request composition.

- [ ] **Step 4: Update onboarding helper tests**

Run: `npm test --workspace @chillclaw/desktop-ui`

Expected: web onboarding tests prove the UI renders daemon-resolved preset data without local onboarding preset ownership.

- [ ] **Step 5: Run the desktop UI build**

Run: `npm run build --workspace @chillclaw/desktop-ui`

Expected: TypeScript and Vite build succeed after the web cleanup.

- [ ] **Step 6: Commit**

Run: `git commit -m "refactor: remove web onboarding preset ownership"`

### Task 5: Remove native onboarding’s local preset and avatar ownership

**Files:**
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingSupport.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingViewModel.swift`
- Modify: `apps/macos-native/Sources/ChillClawNative/OnboardingView.swift`
- Test: `apps/shared/ChillClawKit/Tests/ChillClawKitTests/OnboardingClientTests.swift`

- [ ] **Step 1: Remove native onboarding’s hardcoded onboarding avatar preset list**

Native should render the daemon-owned onboarding preset presentation instead of keeping a parallel preset catalog.

- [ ] **Step 2: Simplify native onboarding support helpers**

Keep only presentation helpers that transform the daemon response for SwiftUI rendering.

- [ ] **Step 3: Update the view model to trust daemon preset data**

Preserve user-editable `name` and `jobTitle`, but stop treating preset internals and preset-backed member request composition as client-owned configuration.

- [ ] **Step 4: Run shared and native Swift tests**

Run: `swift test --package-path apps/shared/ChillClawKit && swift test --package-path apps/macos-native`

Expected: protocol decoding and native onboarding rendering continue to pass.

- [ ] **Step 5: Smoke the native onboarding employee step manually**

Verify the employee preset cards, avatar preview, and name/job title entry still work against daemon-resolved preset data.

- [ ] **Step 6: Commit**

Run: `git commit -m "refactor: remove native onboarding preset ownership"`

## Chunk 3: Verification and Handoff

### Task 6: Run full verification and update docs only if implementation changes user-visible ownership

**Files:**
- Modify if needed: `README.md`
- Modify if needed: `docs/reference/onboarding-design.md`

- [ ] **Step 1: Run the full JS build**

Run: `npm run build`

Expected: contracts, daemon, and desktop UI all build cleanly.

- [ ] **Step 2: Run the full JS test suite**

Run: `npm test`

Expected: contracts, daemon, and desktop UI tests all pass.

- [ ] **Step 3: Run the full native test suite**

Run: `npm run test:mac-native`

Expected: shared Swift package and native macOS tests pass.

- [ ] **Step 4: Do a manual onboarding smoke test**

Verify that web and native onboarding render the same daemon-owned employee presets and no longer depend on local preset definitions.

- [ ] **Step 5: Update docs if the shipped ownership model changed**

If implementation matches this plan, update the README and onboarding reference docs to note that employee preset and managed skill ownership now lives entirely in the daemon catalog.

- [ ] **Step 6: Final commit**

Run: `git commit -m "docs: align onboarding source of truth"`
