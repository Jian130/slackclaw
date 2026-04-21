# Capability Management Refactor TODO

## Purpose

Track the cleanup and removal work discovered during the repo structure review for the capability management design.

This document is not the implementation plan. It is the TODO backlog that should feed the next plan after the capability design is approved.

Related design document:

- `docs/superpowers/specs/2026-04-19-capability-management-design.md`

## Product Direction

ChillClaw should have one daemon-owned place that controls whether skills, tools, plugins, onboarding presets, and feature prerequisites are usable.

The target shape is:

- onboarding presets are declarative config
- capabilities are the product-level source of truth
- skills, tools, and plugins stay as focused action surfaces
- engine-specific behavior stays behind `EngineAdapter`
- OpenClaw-specific config details do not leak into UI or product services
- the design can later map to Hermes Agent without rewriting onboarding or user-facing capability flows

## Refactor Rules

- Do not delete compatibility paths before the new `CapabilityService` can replace their behavior.
- Keep existing API contracts stable during the migration.
- Add new capability fields beside older preset fields first, then remove old fields later.
- Keep implementation changes small enough to test and review independently.
- Avoid broad UI rewrites until the daemon capability model is stable.

## High-Priority TODOs

### 1. Replace `PresetSkillService`

Current files:

- `apps/daemon/src/services/preset-skill-service.ts`
- `apps/daemon/src/routes/server-context.ts`
- `apps/daemon/src/services/onboarding-service.ts`
- `apps/daemon/src/services/skill-service.ts`
- `apps/daemon/src/services/ai-team-service.ts`

Current issue:

`PresetSkillService` is not dead code, but it represents the wrong domain. A preset is configuration that declares desired capabilities. It should not own a runtime lifecycle separate from the rest of skill, tool, and plugin readiness.

Target:

- Move desired preset skill state into capability selection state.
- Move preset reconciliation into `CapabilityService.ensureCapabilities(...)`.
- Keep `presetSkillSync` as a compatibility response while existing clients still read it.
- Delete `PresetSkillService` after onboarding, AI team, skill routes, and tests use capabilities directly.

TODO:

- [ ] Add capability selection state that can represent current preset skill choices.
- [x] Add capability overview fields that can derive the current `presetSkillSync` response.
- [x] Move preset skill reconciliation into capability orchestration.
- [x] Update onboarding to request preset readiness through `CapabilityService` instead of calling `PresetSkillService`.
- [x] Update AI team readiness to resolve runtime skills through `CapabilityService`.
- [x] Update skill routes/tests to read compatibility preset status from the capability layer.
- [x] Delete `apps/daemon/src/services/preset-skill-service.ts`.
- [x] Remove direct `PresetSkillService` construction from `server-context`.

### 2. Absorb `FeatureWorkflowService`

Current files:

- `apps/daemon/src/services/feature-workflow-service.ts`
- `apps/daemon/src/services/channel-setup-service.ts`
- `apps/daemon/src/config/managed-features.ts`

Current issue:

`FeatureWorkflowService` is a small prerequisite coordinator for channel features. That is capability orchestration by another name. Keeping it separate would preserve the current split between skills, plugins, tools, and feature requirements.

Target:

- Move feature prerequisite checks into `CapabilityService`.
- Treat channel setup as one consumer of capability readiness.
- Keep channel setup focused on user configuration and channel-specific validation.

TODO:

- [x] Move managed feature metadata into the capability catalog or make it imported by the catalog.
- [x] Add a capability ID for each managed channel feature, starting with WeChat.
- [x] Map channel feature requirements to skill, tool, plugin, and external installer requirements.
- [x] Make onboarding channel readiness read from the capability overview instead of separate channel/plugin readiness code.
- [x] Replace `FeatureWorkflowService.prepareChannel(...)` with `CapabilityService.prepareChannel(...)`.
- [x] Delete `apps/daemon/src/services/feature-workflow-service.ts`.

### 3. Rename Or Split The OpenClaw Capability Coordinator

Current file:

- `apps/daemon/src/engine/openclaw-skill-plugin-coordinator.ts`

Current issue:

The name collides with the planned product-level `CapabilityService`. The current file is engine-specific and mixes OpenClaw skill filesystem, marketplace, and managed-plugin cleanup behavior.

Target:

Make the adapter-level files clearly engine-specific and concern-specific.

Candidate split:

- `openclaw-skills-coordinator.ts`
- `openclaw-plugin-coordinator.ts`
- `openclaw-tool-access-coordinator.ts`

TODO:

- [ ] Decide whether to rename the current coordinator first or split it immediately.
- [ ] Preserve existing OpenClaw architecture tests during the move.
- [ ] Move skill marketplace and runtime skill helpers into an OpenClaw skill coordinator.
- [ ] Move managed-plugin cleanup helpers into an OpenClaw plugin coordinator.
- [x] Add a new OpenClaw tool access coordinator for `tools.profile`, `tools.allow`, `tools.deny`, `tools.byProvider`, and per-agent overrides.
- [x] Update architecture tests so the product-level `CapabilityService` name is unambiguous.

### 4. Centralize Capability Metadata

Current files:

- `apps/daemon/src/services/channel-setup-service.ts`
- `apps/daemon/src/config/managed-features.ts`
- `apps/daemon/src/config/managed-plugins.ts`
- onboarding preset metadata and related contracts

Current issue:

Capability-like metadata is spread across services and config modules. Channel capabilities live in `ChannelSetupService`, managed features live elsewhere, plugin metadata lives elsewhere, and onboarding presets carry their own skill requirements.

Target:

Create a daemon-owned capability catalog that can describe product capabilities in one place.

TODO:

- [x] Create `apps/daemon/src/config/capability-catalog.ts`.
- [ ] Move user-facing channel capability metadata out of `ChannelSetupService`.
- [x] Reference managed plugins from capability definitions instead of duplicating plugin requirements.
- [x] Reference managed features from capability definitions instead of duplicating feature requirements.
- [x] Add capability definitions for onboarding presets.
- [ ] Add tool or toolset requirements to capability definitions.
- [ ] Keep localized client copy out of the catalog unless existing daemon metadata already owns it.

## Medium-Priority TODOs

### 5. Add Tool Management Without Expanding `OpenClawConfigManager`

Current files:

- `apps/daemon/src/engine/openclaw-config-manager.ts`
- `apps/daemon/src/engine/openclaw-adapter.ts`

Current issue:

`OpenClawConfigManager` is already broad. Adding tool access policy there would make the OpenClaw adapter more tangled and make future Hermes support harder.

Target:

Add tool access through a capability-oriented adapter surface.

TODO:

- [x] Add engine-neutral runtime tool types to daemon contracts.
- [x] Add `ToolService` as a product-layer service.
- [x] Add adapter methods for listing runtime tools and reading effective tool access.
- [ ] Add adapter methods for patching tool access.
- [x] Implement OpenClaw tool access read with OpenClaw config/schema behavior.
- [ ] Keep direct config-file edits as OpenClaw adapter fallback behavior only.
- [ ] Map Hermes toolsets later through the same adapter contract.

### 6. Remove The Thin OpenClaw Plugin Wrapper

Removed file:

- `apps/daemon/src/engine/openclaw-plugin-manager.ts`

Current issue:

The wrapper was thin pass-through code after plugin work moved through capability adapter surfaces.

Target:

Remove it once `OpenClawSkillPluginCoordinator` can satisfy the adapter `PluginManager` contract directly.

TODO:

- [x] Keep the OpenClaw plugin wrapper during the first capability migration.
- [x] Recheck whether it still adds value after `PluginService` and `CapabilityService` share adapter capability methods.
- [x] Delete or inline it only if the adapter contract stays clearer without it.

### 7. Keep Large File Splits Targeted

Current files:

- `apps/daemon/src/engine/openclaw-adapter.ts`
- `apps/daemon/src/services/onboarding-service.ts`
- `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`
- `apps/desktop-ui/src/features/skills/SkillsPage.tsx`

Current issue:

Several files are large, but splitting them before the domain boundary is fixed risks cosmetic churn.

Target:

Only split the parts touched by capability management.

TODO:

- [ ] Move onboarding preset/capability readiness logic out of `OnboardingService` as part of the capability migration.
- [ ] Avoid broad onboarding UI decomposition until daemon capability responses are stable.
- [ ] Keep OpenClaw adapter extraction focused on skill, plugin, and tool access boundaries.
- [ ] Add architecture tests for any new adapter-level coordinators.

## Low-Priority TODOs

### 8. Audit Frontend Compatibility Barrels

Checked files:

- `apps/desktop-ui/src/api.ts` (removed)
- `apps/desktop-ui/src/i18n.ts` (removed)
- `apps/desktop-ui/src/App.tsx`
- `apps/desktop-ui/src/styles.css`

Current issue:

`api.ts` and `i18n.ts` were unused internal compatibility barrels. `App.tsx` and `styles.css` are still entrypoint compatibility files.

Target:

Remove only barrels that are confirmed not to be imported by tests, clients, package exports, or external tooling.

TODO:

- [x] Check package exports, tests, and build entrypoints before removing any frontend barrel.
- [x] Keep `App.tsx` because `main.tsx` still imports the entrypoint barrel.
- [x] Keep `styles.css` because `main.tsx` still imports the stylesheet barrel.
- [x] Remove `api.ts` and `i18n.ts` only if no compatibility consumers exist.

### 9. Update Reference Docs After Code Migration

Current files:

- `docs/reference/*`
- `docs/superpowers/specs/2026-04-19-capability-management-design.md`

Current issue:

Reference docs may continue to mention `PresetSkillService`, `FeatureWorkflowService`, adapter config shortcuts, or preset-specific readiness after the code changes.

Target:

Keep docs aligned with the actual architecture after each migration phase.

TODO:

- [x] Update reference docs when `CapabilityService` becomes the source of truth.
- [ ] Update references to preset skill sync after compatibility fields are removed.
- [ ] Update OpenClaw adapter documentation after coordinator rename or split.
- [ ] Add Hermes mapping notes when the future Hermes adapter work begins.

## Suggested Implementation Phases

### Phase 1: Add Read-Only Capability Foundation

- [x] Add capability catalog.
- [x] Add `CapabilityService` overview read path.
- [x] Add `ToolService` read path.
- [x] Keep all existing services and API responses intact.

### Phase 2: Move Onboarding Presets To Capabilities

- [x] Add capability IDs to onboarding preset definitions.
- [x] Let onboarding call `CapabilityService` for readiness and repair.
- [ ] Keep `presetSkillSync` as a derived compatibility field.

### Phase 3: Move Channel Feature Preparation To Capabilities

- [x] Move managed channel capability metadata into the catalog.
- [x] Replace `FeatureWorkflowService.prepareChannel(...)`.
- [x] Delete `FeatureWorkflowService`.

### Phase 4: Add Tool Access Management

- [x] Implement OpenClaw tool access read.
- [ ] Implement OpenClaw tool access patch.
- [ ] Surface capability blockers caused by denied or missing tools.

### Phase 5: Remove Preset Skill Compatibility

- [x] Remove direct `PresetSkillService` usage.
- [ ] Remove legacy preset-only state once clients no longer depend on it.
- [x] Delete `PresetSkillService`.

### Phase 6: Prepare For Hermes

- [ ] Add engine-neutral mapping for Hermes toolsets.
- [ ] Add Hermes skill root and skill metadata mapping.
- [ ] Keep Hermes support inside adapter implementation, not product services.

## Open Decisions Before Implementation Planning

- Should the first implementation plan include tool access read-only support, or should tools start as catalog requirements only?
- Should the OpenClaw coordinator be renamed before or after `CapabilityService` lands?
- Should capability IDs be stable product IDs such as `skill:wechat-workflow` and `toolset:web`, or should onboarding presets own higher-level IDs that expand into those lower-level IDs?
- Should the first UI surface be hidden behind existing Skills/Onboarding screens, or should `/api/capabilities/*` be added before any client changes?
