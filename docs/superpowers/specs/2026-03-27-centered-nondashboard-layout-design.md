# Centered Non-Dashboard Layout Design

## Goal

Center every non-dashboard page inside a bounded content container while keeping the content inside that container left-aligned. Apply the same rule to both the React local web UI and the native macOS client.

## Problem

The current non-dashboard screens sit flush against the left side of the available content area. The dashboard benefits from a wider, edge-to-edge workspace, but guided flows, settings-style screens, configuration pages, and similar content read better when the overall page block is centered with a clear maximum width.

The current behavior is inconsistent with the product goal of a polished, guided experience for non-technical users. It also pushes too much whitespace to the right side of the app window instead of using it as balanced outer margin.

## Scope

In scope:

- React `WorkspaceScaffold`
- React `OperationsScaffold`
- React `GuidedFlowScaffold`
- Native macOS `WorkspaceScaffold`
- Native macOS `OperationsScaffold`
- Native macOS `GuidedFlowScaffold`
- Explicit dashboard exception handling
- Shared width contracts for web and native

Out of scope:

- `SplitContentScaffold` in React
- `SplitContentScaffold` in native macOS
- Reworking page-internal grids, cards, or typography
- Page-specific alignment overrides unless the shared scaffold rule proves insufficient

## Design Rule

The alignment rule is:

- Center the outer page block in the available content area.
- Keep text, cards, forms, and internal sections left-aligned inside that page block.
- Use one shared max-width contract for non-dashboard pages.
- Preserve full-width layouts only where the screen is intentionally spatial, such as dashboard and split-detail/chat surfaces.

This is a container-centering change, not a text-centering change.

## Recommended Approach

Implement the alignment rule at the scaffold layer instead of patching individual pages.

Why this approach:

- It matches the repo’s shared scaffold rule.
- It keeps behavior consistent across screens.
- It avoids future drift where newly added pages forget the layout rule.
- It preserves a single explicit exception path for dashboard and split layouts.

## React Design

### Scaffold API

Add a shared width mode to the scaffold primitives:

- `contentWidth: "centered" | "full"`

Behavior:

- `WorkspaceScaffold` defaults to `"centered"`.
- `OperationsScaffold` defaults to `"centered"`.
- `GuidedFlowScaffold` defaults to `"centered"`.
- `SplitContentScaffold` defaults to `"full"`.

Dashboard behavior:

- `DashboardPage` explicitly uses `contentWidth="full"` on `WorkspaceScaffold`.

This keeps the dashboard as the deliberate wide exception instead of making width behavior implicit in page CSS.

### React Layout Styling

Add one shared scaffold container class in the shared layout styling. The centered mode should:

- use full available width
- cap width with one shared semantic max width
- center itself with auto inline margins

Conceptually:

- outer page area stays fluid
- scaffold inner shell becomes bounded and centered
- scaffold children remain left-aligned

`GuidedFlowScaffold` should center the outer shell only. Its existing onboarding-specific width tokens and panel sizing continue to control the card and internal flow layout.

## Native macOS Design

### Native Scaffold API

Mirror the same width mode in `NativeUIScaffolds.swift`, using a small enum or optional max-width contract:

- `.centered`
- `.full`

Behavior:

- `WorkspaceScaffold` defaults to centered
- `OperationsScaffold` defaults to centered
- `GuidedFlowScaffold` defaults to centered
- `SplitContentScaffold` remains full-width

Dashboard behavior:

- Dashboard explicitly opts into `.full`

### Native Layout Behavior

The centered mode should:

- keep the scroll view/content region fluid
- constrain the scaffold body to a maximum width
- horizontally center that bounded block
- preserve leading alignment inside the bounded block

This should be implemented in the scaffold body instead of repeated screen-level wrappers.

## Shared Sizing Contract

Define one semantic max width per client:

- Web token in `apps/desktop-ui/src/shared/styles/tokens.css`
- Native constant in `NativeUI`

Recommended target:

- around `1180px` to `1200px`

Rationale:

- wide enough for operations pages and moderate two-column content
- narrow enough to avoid left-heavy composition on large windows
- still compatible with onboarding’s existing panel sizing

The value should be semantic, not page-local.

## Exceptions

Keep these layouts full-width:

- Dashboard
- Split-content layouts such as chat/detail pages

Do not add more exceptions unless a specific page demonstrates that the shared scaffold rule is wrong.

## Verification

Manual verification should confirm:

- Dashboard still uses the wide layout
- Deploy, Config, Skills, Members, Team, Settings, and onboarding are centered as bounded blocks
- Their internal text and controls remain left-aligned
- Chat/split-detail layouts stay full-width
- The centered behavior matches across React and macOS
- Desktop and narrower widths still collapse correctly without clipping or awkward horizontal overflow

## Risks

Primary risk:

- applying centering too high in the layout tree and accidentally constraining dashboard or split layouts

Mitigation:

- keep the width mode on scaffold primitives
- make dashboard and split layouts explicit `full` cases
- verify wide-window behavior on both clients

## Implementation Summary

1. Add a shared centered/full width mode to web scaffolds.
2. Add the centered container styles and semantic width token on web.
3. Make dashboard explicitly full-width.
4. Add the same centered/full width mode to native scaffolds.
5. Add the native semantic max-width constant.
6. Make native dashboard explicitly full-width.
7. Verify onboarding, deploy, config, skills, members, team, settings, dashboard, and chat layouts.
