# Provider Catalog Refresh Design

**Date:** 2026-03-31

## Goal

Refresh ChillClaw's model-provider catalog from the latest OpenClaw provider documentation, extend the shared provider metadata contract with richer app-usable fields, and surface that richer metadata in the web configuration UI without changing onboarding behavior.

## Scope

- Refresh the provider catalog in `apps/daemon/src/config/openclaw-model-provider-catalog.ts` against the latest OpenClaw provider docs
- Update provider labels, descriptions, docs links, provider refs, auth-method metadata, and recommended model examples where the docs have changed
- Extend `ModelProviderConfig` with richer optional metadata that the app can render directly
- Preserve the existing daemon-owned export path through `GET /api/models/config`
- Surface the new metadata in the web config UI only
- Add or update tests covering the new contract fields and config rendering

## Non-Goals

- No runtime scraping or live fetching of docs from the app
- No onboarding UI changes in this pass
- No changes to how provider auth sessions execute
- No changes to native macOS config UI in this pass
- No attempt to model every sentence in the docs as structured metadata

## Constraints

- Keep the daemon catalog as the single source of truth for provider metadata
- Keep frontend code provider-agnostic; it should render daemon-owned metadata, not infer provider behavior
- Preserve the current distinction between:
  - curated provider metadata from the daemon catalog
  - runtime-discovered `sampleModels` derived from the live model catalog
- Avoid widening the contract with fields that are difficult to render consistently or validate
- Do not expose raw OpenClaw complexity unless it helps users choose or authenticate a provider

## Source Material

Use the latest OpenClaw docs as the refresh input, primarily:

- `https://docs.openclaw.ai/providers`
- `https://docs.openclaw.ai/concepts/model-providers`
- linked provider pages under `https://docs.openclaw.ai/providers/*`

The catalog remains a checked-in curated snapshot of those docs. ChillClaw should not depend on docs availability at runtime.

## Current Problems

- The provider catalog mixes older and newer doc conventions, so some provider labels, links, and auth descriptions are stale
- `ModelProviderConfig` carries only the minimum data needed for existing flows, which forces the UI to rely on generic wording even when the docs contain clearer setup hints
- `sampleModels` is derived from the current runtime catalog, which is useful but not the same thing as curated example model refs from the docs
- The config screen can link to docs and show auth methods, but it cannot show higher-signal guidance such as expected env vars, local-versus-gateway setup notes, or provider warnings

## Design

### 1. Extend the shared provider contract

Extend `packages/contracts/src/index.ts` so `ModelProviderConfig` includes these optional fields:

- `exampleModels: string[]`
- `authEnvVars: string[]`
- `setupNotes: string[]`
- `warnings: string[]`
- `providerType: "built-in" | "custom" | "local" | "gateway" | "community"`
- `supportsNoAuth: boolean`

These fields are chosen because they are:

- directly useful in product UI
- stable enough to curate from docs
- distinct from runtime-derived values already in the contract

Keep `authMethods` as the structured representation of actual ChillClaw-supported auth choices. Do not replace it with prose.

### 2. Keep `sampleModels` and add curated examples separately

Keep `sampleModels` as-is: runtime-derived from the discovered OpenClaw model catalog.

Add `exampleModels` as doc-backed recommendations curated in the provider catalog. This preserves an important product distinction:

- `sampleModels`: what the current runtime discovered
- `exampleModels`: what ChillClaw recommends showing as known-good examples for that provider

The config UI should prefer `exampleModels` for provider guidance and continue to use discovered models for actual model selection.

### 3. Refresh catalog coverage from the latest docs

Update existing providers to reflect current OpenClaw docs:

- labels and descriptions
- provider docs URLs
- provider refs
- auth method labels, descriptions, and interactive versus non-interactive paths
- curated example model refs
- auth env-var hints
- setup notes and warnings where the docs call out meaningful caveats

Also reconcile provider coverage with the docs so the catalog represents the current model-provider surface, not just the older hand-maintained subset.

Provider inclusion policy for this pass:

- Include model providers that fit ChillClaw's current model-selection and auth UX
- Include local and gateway-backed model providers where the docs describe them as model providers
- Exclude transcription-only providers from the model-provider catalog
- Exclude purely community or policy-sensitive entries when ChillClaw cannot support them cleanly through the current auth/config flow

That means entries like Deepgram should stay out of the model-provider catalog, while model providers such as SGLang should be considered in scope. Community or policy-sensitive entries such as Claude Max API Proxy should only be added if their auth and model-selection path can be represented honestly in ChillClaw's existing UX without implying endorsement

### 4. Preserve daemon export flow

Keep `apps/daemon/src/engine/openclaw-adapter.ts` as the canonical export path for provider metadata in `buildModelConfigOverview()`.

The adapter should pass through the richer provider metadata along with:

- `configured`
- `modelCount`
- `sampleModels`

No client should query docs directly or compute provider metadata locally.

### 5. Surface richer metadata in web config only

Update `apps/desktop-ui/src/features/config/ConfigPage.tsx` to render the new provider metadata in the existing provider details area, keeping the workflow simple and focused.

Show high-signal guidance only:

- provider type
- example model refs
- auth env vars
- setup notes
- warnings

Do not add extra steps, accordions, or advanced controls. The goal is to make provider choice and setup clearer, not to turn config into a provider encyclopedia.

### 6. Preserve current auth behavior

Refreshing docs-backed metadata must not change how auth execution works unless the catalog's supported auth methods were genuinely stale.

In practice:

- existing method IDs should remain stable whenever possible
- method ordering should continue to support the current default-selection behavior
- new methods should only be added when ChillClaw can actually execute them through the current daemon flow
- docs that mention auth options not supported by ChillClaw yet should be captured as notes or warnings, not exposed as fake selectable auth methods

## UI Behavior

In the config screen:

- the provider tile list remains simple and fast to scan
- after selecting a provider, the existing provider info banner gains richer structured context
- auth method selection remains the same
- model selection remains the same
- the new metadata appears as compact supporting guidance near the provider details and auth setup area

The UI should prefer short lists and labels over long prose blocks. Warnings should be visually distinct from setup notes.

## Error Handling

- Missing optional metadata fields should render nothing rather than fallback junk text
- If a provider docs URL is missing or intentionally blank, the config UI should continue to hide the docs link
- If docs describe a provider path that ChillClaw cannot support yet, represent that as notes or warnings rather than partial interactive controls
- If a provider has no-auth local setup, `supportsNoAuth` and `setupNotes` should explain that clearly without forcing API-key-style copy

## Testing

- Update contract serialization tests in `packages/contracts/src/index.test.ts`
- Add or update daemon tests that assert richer provider metadata is exported through `getModelConfig()`
- Add focused web config tests for rendering provider metadata and warnings
- Keep existing auth-method selection and validation tests passing

## Verification

- `npm run build`
- `npm test`
- targeted search or assertions confirming the catalog reflects the refreshed provider docs
- manual smoke check in the web config flow:
  - provider list renders
  - provider details render new metadata
  - auth method selection still works
  - docs links still open the correct provider page
