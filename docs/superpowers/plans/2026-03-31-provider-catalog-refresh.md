# Provider Catalog Refresh Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh ChillClaw's model-provider catalog from the latest OpenClaw docs, extend the shared provider metadata contract with richer app-usable fields, and surface that richer metadata in the web config UI without changing onboarding.

**Architecture:** Keep the daemon-owned provider catalog as the only source of truth, add a small set of optional metadata fields to `ModelProviderConfig`, and pass them through the existing `GET /api/models/config` path. Separate curated doc-backed metadata (`exampleModels`, `authEnvVars`, notes, warnings) from runtime-derived metadata (`sampleModels`) so the config UI can show richer guidance without inventing provider logic locally.

**Tech Stack:** TypeScript, Node.js, React 19, Vitest, Swift, Swift Testing, shared ChillClaw contracts, OpenClaw provider docs

---

## File Map

**Shared contracts and protocol models**

- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/index.test.ts`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Models.swift`
- Modify: `apps/shared/ChillClawKit/Tests/ChillClawKitTests/ChillClawProtocolTests.swift`

**Daemon provider catalog and model-config export**

- Modify: `apps/daemon/src/config/openclaw-model-provider-catalog.ts`
- Modify: `apps/daemon/src/engine/openclaw-adapter.ts`
- Modify: `apps/daemon/src/engine/openclaw-adapter.test.ts`

**Web config UI**

- Modify: `apps/desktop-ui/src/features/config/ConfigPage.tsx`
- Modify: `apps/desktop-ui/src/features/config/ConfigPage.test.tsx`
- Modify: `apps/desktop-ui/src/shared/styles/pages.css`

**Reference material used during implementation**

- Read-only: `docs/superpowers/specs/2026-03-31-provider-catalog-refresh-design.md`
- Read-only: `https://docs.openclaw.ai/providers`
- Read-only: `https://docs.openclaw.ai/concepts/model-providers`

---

## Chunk 1: Shared Provider Metadata Contract

### Task 1: Add failing contract tests for richer provider metadata

**Files:**
- Modify: `packages/contracts/src/index.test.ts`
- Modify: `apps/shared/ChillClawKit/Tests/ChillClawKitTests/ChillClawProtocolTests.swift`

- [ ] **Step 1: Add a failing TypeScript contract serialization test that includes the new provider metadata fields on `ModelProviderConfig`**

```ts
exampleModels: ["openai/gpt-5.4", "openai/gpt-5.4-pro"],
authEnvVars: ["OPENAI_API_KEY", "OPENAI_API_KEYS"],
setupNotes: ["Default transport is auto (WebSocket-first, SSE fallback)."],
warnings: [],
providerType: "built-in",
supportsNoAuth: false
```

- [ ] **Step 2: Add a failing Swift decoding test in `ChillClawProtocolTests.swift` that decodes a `ModelConfigOverview` payload containing the same fields**
- [ ] **Step 3: Run `npm test --workspace @chillclaw/contracts` and verify the new TypeScript assertions fail because the contract shape is incomplete**
- [ ] **Step 4: Run `swift test --package-path apps/shared/ChillClawKit --filter ChillClawProtocolTests` and verify the new Swift decoding assertions fail**

### Task 2: Implement the shared contract additions

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Models.swift`

- [ ] **Step 1: Extend `ModelProviderConfig` in `packages/contracts/src/index.ts` with the optional fields from the approved spec**

```ts
exampleModels?: string[];
authEnvVars?: string[];
setupNotes?: string[];
warnings?: string[];
providerType?: "built-in" | "custom" | "local" | "gateway" | "community";
supportsNoAuth?: boolean;
```

- [ ] **Step 2: Mirror the same properties in `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Models.swift` using optional Swift types so native decoding stays forward-compatible**
- [ ] **Step 3: Re-run `npm test --workspace @chillclaw/contracts` and verify the TypeScript contract test passes**
- [ ] **Step 4: Re-run `swift test --package-path apps/shared/ChillClawKit --filter ChillClawProtocolTests` and verify the Swift protocol test passes**
- [ ] **Step 5: Commit this chunk**

```bash
git add packages/contracts/src/index.ts \
  packages/contracts/src/index.test.ts \
  apps/shared/ChillClawKit/Sources/ChillClawProtocol/Models.swift \
  apps/shared/ChillClawKit/Tests/ChillClawKitTests/ChillClawProtocolTests.swift
git commit -m "feat: extend model provider metadata contract"
```

---

## Chunk 2: Refresh Daemon Provider Catalog From Current OpenClaw Docs

### Task 3: Add failing daemon tests for exported provider metadata

**Files:**
- Modify: `apps/daemon/src/engine/openclaw-adapter.test.ts`

- [ ] **Step 1: Extend the existing `getModelConfig()` coverage test so it asserts at least one exported provider includes curated doc-backed metadata**
- [ ] **Step 2: Add a failing assertion that distinguishes curated `exampleModels` from runtime-derived `sampleModels`**
- [ ] **Step 3: Add a failing assertion that one local provider and one gateway provider export the expected `providerType` and `supportsNoAuth` values**
- [ ] **Step 4: Run `node --import tsx --test apps/daemon/src/engine/openclaw-adapter.test.ts --test-name-pattern \"model config uses the full provider catalog\"` and verify the new assertions fail**

### Task 4: Refresh the provider catalog structure and doc-backed metadata

**Files:**
- Modify: `apps/daemon/src/config/openclaw-model-provider-catalog.ts`

- [ ] **Step 1: Add the new optional metadata fields to `InternalModelProviderConfig` by inheriting from the expanded `ModelProviderConfig` shape**
- [ ] **Step 2: Create small local helper constants or factory helpers if needed to reduce repeated arrays like auth env vars and provider types, but keep the file readable and data-first**
- [ ] **Step 3: Audit the latest provider docs at `https://docs.openclaw.ai/providers` and `https://docs.openclaw.ai/concepts/model-providers` and update every in-scope provider entry with current labels, descriptions, docs URLs, auth methods, and curated example models**
- [ ] **Step 4: Reconcile provider coverage with the current docs and add any missing in-scope providers that fit ChillClaw's current model/auth UX**
- [ ] **Step 5: Keep unsupported or policy-sensitive auth paths out of `authMethods`; capture them as `setupNotes` or `warnings` instead**
- [ ] **Step 6: Set `providerType`, `authEnvVars`, `setupNotes`, `warnings`, and `supportsNoAuth` for providers where the docs provide meaningful guidance**

Use this rule while editing the catalog:

- `sampleModels` remains runtime-derived and must not be hardcoded in the catalog
- `exampleModels` is the curated docs-backed field
- `authMethods` should only include methods ChillClaw can actually execute today

### Task 5: Export the richer metadata through the existing model-config path

**Files:**
- Modify: `apps/daemon/src/engine/openclaw-adapter.ts`
- Modify: `apps/daemon/src/engine/openclaw-adapter.test.ts`

- [ ] **Step 1: Update `buildModelConfigOverview()` so each provider in the response includes the new optional metadata fields in addition to existing fields**
- [ ] **Step 2: Keep `sampleModels` derived from `matches.slice(0, 5)` exactly as it works today**
- [ ] **Step 3: Re-run `node --import tsx --test apps/daemon/src/engine/openclaw-adapter.test.ts --test-name-pattern \"model config uses the full provider catalog\"` and verify the provider metadata assertions pass**
- [ ] **Step 4: Re-run `npm test --workspace @chillclaw/daemon` and verify the broader daemon suite still passes**
- [ ] **Step 5: Commit this chunk**

```bash
git add apps/daemon/src/config/openclaw-model-provider-catalog.ts \
  apps/daemon/src/engine/openclaw-adapter.ts \
  apps/daemon/src/engine/openclaw-adapter.test.ts
git commit -m "feat: refresh provider catalog metadata"
```

---

## Chunk 3: Show Richer Provider Guidance In The Web Config UI

### Task 6: Add failing web tests for provider metadata presentation

**Files:**
- Modify: `apps/desktop-ui/src/features/config/ConfigPage.test.tsx`

- [ ] **Step 1: Expand the local `provider` fixture to include the new metadata fields**
- [ ] **Step 2: Add a failing helper or render test that expects curated `exampleModels` to be preferred over `sampleModels` for provider guidance text**
- [ ] **Step 3: Add a failing render test that expects auth env vars, setup notes, and warnings to appear only when present**
- [ ] **Step 4: Add a failing test that expects providers with `supportsNoAuth: true` to render a local/no-auth hint instead of generic API-key-only copy**
- [ ] **Step 5: Run `npm test --workspace @chillclaw/desktop-ui -- ConfigPage` and verify the new assertions fail**

### Task 7: Implement compact provider metadata rendering in the config dialog

**Files:**
- Modify: `apps/desktop-ui/src/features/config/ConfigPage.tsx`
- Modify: `apps/desktop-ui/src/shared/styles/pages.css`

- [ ] **Step 1: Add small helper functions inside `ConfigPage.tsx` to normalize the provider metadata the UI needs to render, keeping this logic close to the config page**
- [ ] **Step 2: In the selected-provider `InfoBanner` area, render compact sections for provider type, curated example models, auth env vars, setup notes, and warnings**
- [ ] **Step 3: Make warnings visually distinct from setup notes without adding new workflow steps or advanced controls**
- [ ] **Step 4: Preserve the existing provider picker, model picker, and auth method selector behavior**
- [ ] **Step 5: Add scoped styles in `apps/desktop-ui/src/shared/styles/pages.css` for the new provider guidance blocks instead of inline layout-heavy styling**

Prefer a structure like this:

```tsx
<div className="config-page__provider-guidance">
  <div className="config-page__provider-group">...</div>
  <div className="config-page__provider-group">...</div>
</div>
```

### Task 8: Re-run targeted tests, full JS build/test, and finish the branch

**Files:**
- Modify: `apps/desktop-ui/src/features/config/ConfigPage.test.tsx`
- Modify: `apps/desktop-ui/src/features/config/ConfigPage.tsx`
- Modify: `apps/desktop-ui/src/shared/styles/pages.css`

- [ ] **Step 1: Re-run `npm test --workspace @chillclaw/desktop-ui -- ConfigPage` and verify the config metadata tests pass**
- [ ] **Step 2: Re-run `npm run build` and verify contracts, daemon, and desktop UI still build**
- [ ] **Step 3: Re-run `npm test` and verify the full JS/TS suite still passes**
- [ ] **Step 4: Manually smoke check the config dialog with at least one built-in provider, one gateway provider, and one local provider**
- [ ] **Step 5: Commit this chunk**

```bash
git add apps/desktop-ui/src/features/config/ConfigPage.tsx \
  apps/desktop-ui/src/features/config/ConfigPage.test.tsx \
  apps/desktop-ui/src/shared/styles/pages.css
git commit -m "feat: show richer provider guidance in config"
```

