# WeChat And WeChat Work Workflow Split Design

## Goal

Split the current overloaded `wechat` setup path into two distinct product features:

- `wechat-work` for **WeChat Work (WeCom)**
- `wechat` for **WeChat** personal

At the same time, evolve the daemon-owned plugin manager into a more flexible daemon-owned setup workflow layer that can manage different prerequisites and setup modes for channels now and models or other feature flows later.

## Problem

The current code treats one `wechat` feature as both:

- a WeCom plugin-backed integration
- the product-facing label for what users understand as WeChat

That is incorrect at both the UX layer and the architecture layer.

For users:

- WeChat Work and personal WeChat are different platforms
- the current naming hides that difference
- the current WeChat Work form asks for the wrong visible fields

For architecture:

- the current daemon-owned plugin manager assumes every managed feature looks like an OpenClaw plugin
- that assumption already breaks once personal WeChat uses a different installer and a QR-first login workflow
- future model setup flows are also likely to need distinct prerequisites and multi-step sessions

We need a product layer that models feature workflows honestly instead of forcing everything through one plugin-shaped abstraction.

## Scope

In scope:

- split `wechat` into `wechat-work` and `wechat`
- rename all product-facing WeCom copy to `WeChat Work (WeCom)` or `WeChat Work`
- keep a temporary migration path for old saved `wechat` state
- change WeChat Work setup fields to `botId` and `secret`
- add a real personal WeChat workflow using the latest installer command:
  - `npx -y @tencent-weixin/openclaw-weixin-cli@latest install`
- make personal WeChat onboarding QR-first
- introduce a daemon-owned setup workflow orchestration layer above specific prerequisite managers
- preserve the existing OpenClaw plugin manager as one prerequisite manager under that higher-level workflow layer

Out of scope:

- shipping a consumer WeChat installer lifecycle beyond the command above
- managing a separate personal WeChat runtime outside the documented installer flow
- redesigning unrelated onboarding or config UI
- refactoring every existing daemon config surface into workflow sessions in one pass

## Platform Split

### WeChat Work (WeCom)

Identity:

- internal id: `wechat-work`
- user-facing label: `WeChat Work (WeCom)` in long-form contexts
- user-facing label: `WeChat Work` in compact contexts

Setup mode:

- credential form
- visible fields:
  - `botId`
  - `secret`
- hidden/generated values remain daemon-owned if still required by the runtime path

Prerequisite:

- managed OpenClaw plugin
- install path:
  - `openclaw plugins install @wecom/wecom-openclaw-plugin`

### WeChat

Identity:

- internal id: `wechat`
- user-facing label: `WeChat`

Setup mode:

- QR-first guided session
- no manual onboarding fields by default

Prerequisite:

- external installer flow
- install path:
  - `npx -y @tencent-weixin/openclaw-weixin-cli@latest install`

Completion:

- not complete at config-save time
- complete only after the QR login flow confirms success

## Recommended Approach

Keep the existing daemon-owned OpenClaw plugin manager, but move it under a higher-level daemon-owned **feature workflow orchestration layer**.

Why this approach:

- it preserves the good work already done for managed OpenClaw plugins
- it avoids pretending personal WeChat is “just another plugin”
- it creates one product-layer abstraction that can later support model auth, local runtime downloads, QR flows, OAuth flows, and repair flows
- it keeps the frontend clients thin and daemon-driven

## Workflow Architecture

### High-Level Rule

The daemon owns setup workflows for product features.

A feature can be:

- a channel
- a model
- a skill-adjacent capability
- another product feature with prerequisites and multi-step setup

Each feature definition should own:

- feature id
- type
- label and copy
- setup kind
- prerequisites
- remove and repair behavior
- live session and progress semantics

### Proposed Layers

#### Managed Feature Registry

Add a daemon-owned registry that defines product features such as:

- `channel:wechat-work`
- `channel:wechat`
- future `model:*` features

Each definition should include:

- `id`
- `kind`
- `channelId` or equivalent product id
- display labels
- setup kind
- prerequisite definitions
- migration aliases if needed

#### Feature Workflow Service

Add a daemon-owned orchestration service that coordinates:

- starting feature setup
- ensuring prerequisites
- starting or resuming sessions
- completing setup
- removing or repairing a feature

This service is the product-layer coordinator above the adapter-specific managers.

#### Prerequisite Managers

Keep prerequisites modular.

Initial prerequisite managers:

- OpenClaw plugin prerequisite manager
- external installer prerequisite manager

Likely future managers:

- model runtime prerequisite manager
- auth prerequisite manager
- local package or daemon prerequisite manager

The feature workflow service chooses the right manager for each prerequisite type.

### Why This Is Better Than A Pure Plugin Manager

`wechat-work` needs a plugin prerequisite plus a credential save flow.

`wechat` needs an external installer prerequisite plus a QR login flow.

Future model setup may need:

- OAuth login
- API key validation
- runtime installation
- model download

Those are all product-level workflows, not plugin actions. The daemon should model that directly.

## WeChat Work Design

### Setup Contract

Visible inputs:

- `botId`
- `secret`

Removed from the user-facing setup flow:

- `corpId`

Daemon behavior:

- ensure the managed WeCom plugin is installed, updated, and enabled
- write the WeCom channel config
- keep any runtime-only generated fields daemon-owned

### Product Copy

All user-facing references should distinguish this from personal WeChat:

- use `WeChat Work (WeCom)` in explanatory copy
- use `WeChat Work` where space is limited
- do not call this plain `WeChat`

### Plugin Surface

This remains a true managed plugin and should continue to appear in the dedicated Plugins surface.

## Personal WeChat Design

### Setup Contract

Personal WeChat is QR-first.

Onboarding behavior:

- no manual form fields by default
- primary action starts the setup
- the daemon first ensures the installer prerequisite
- then the daemon moves the user into a QR login session

### Installer Behavior

Installer command:

- `npx -y @tencent-weixin/openclaw-weixin-cli@latest install`

This should be treated as a daemon-managed prerequisite step, not as a plugin card.

### Session Behavior

The daemon should expose a clear session state model for the QR flow, for example:

- installing
- ready-for-qr
- waiting-for-scan
- confirmed
- failed

Clients should render these states directly instead of inferring them locally.

### Completion Rule

Personal WeChat setup is not complete after prerequisite install alone.

It is complete only after the QR login flow succeeds and the daemon confirms the linked runtime state.

## Migration And Compatibility

This rename touches stored state, onboarding state, and managed feature ids. We should migrate carefully.

### Stored State Migration

Migrate persisted channel ids:

- old `wechat` -> new `wechat-work`

Migrate managed feature ids:

- old `channel:wechat` -> new `channel:wechat-work`

### Compatibility Window

For one rollout window, the daemon should still read old `wechat` state and normalize it to `wechat-work` before returning data to clients.

This prevents breakage for users who already configured the old WeCom path.

### Post-Migration Rule

After this split:

- `wechat-work` always means WeChat Work (WeCom)
- `wechat` always means personal WeChat
- no new code should overload one id for both meanings

## API And Contract Changes

### Channel Contracts

Update shared contracts to support both channel ids:

- `wechat-work`
- `wechat`

Update onboarding metadata, config capabilities, and persisted entries to reflect the split.

### Workflow Session Contracts

Add daemon-owned session contracts for multi-step feature workflows.

These should support at least:

- current session state
- progress/status message
- next required user action
- launch URL or QR payload if needed
- retry/cancel capability when applicable

These contracts should be generic enough for later model workflows too.

### Event Model

Keep:

- `plugin-config.updated` for real plugin inventory changes

Add a more general retained workflow event when needed, rather than overloading plugin events with QR status or model download state.

## Client Design

### Onboarding

Clients should render two distinct channel entries:

- `WeChat Work (WeCom)`
- `WeChat`

WeChat Work:

- shows the credential form with `Bot ID` and `Secret`

WeChat:

- shows a QR-first setup card with a primary action to start setup
- shows live progress/session state from the daemon

### Config Screens

Config screens should also keep these two entries separate and preserve the same distinction outside onboarding.

### Plugins Screen

The dedicated Plugins screen should continue to show only true OpenClaw plugin-backed managed items such as WeChat Work.

Personal WeChat should not be faked as an OpenClaw plugin card if it is installed via an external installer.

## Verification

### Contracts

Verify:

- both channel ids serialize and decode in TypeScript and Swift
- workflow session contracts serialize and decode correctly
- migration aliases normalize old ids safely

### Daemon

Verify:

- old `wechat` saved state migrates to `wechat-work`
- WeChat Work no longer requires `corpId`
- WeChat Work uses the OpenClaw plugin prerequisite path
- personal WeChat uses the external installer prerequisite path
- personal WeChat enters a QR workflow session instead of a credential save flow

### Clients

Verify:

- onboarding renders both entries distinctly
- WeChat Work shows `Bot ID` and `Secret`
- WeChat shows no manual fields in the default QR-first flow
- config surfaces and summaries clearly distinguish the two products

### Regression

Verify:

- existing WeChat Work users keep their saved setup after migration
- plugin manager behavior for WeChat Work still works
- the daemon workflow layer remains compatible with future model workflows

## Risks

Primary risks:

- breaking existing saved `wechat` state during the rename
- mixing plugin inventory concerns with broader workflow-state concerns
- building a workflow abstraction that is too channel-specific to support models later

Mitigations:

- add explicit migration and compatibility handling
- keep plugin inventory and feature workflow state as separate but coordinated concepts
- model setup kinds and prerequisites generically from the start

## Implementation Summary

1. Rename the existing WeCom-backed `wechat` feature to `wechat-work`.
2. Add migration and compatibility handling for old `wechat` state.
3. Update WeChat Work product copy and change its visible fields to `botId` and `secret`.
4. Introduce a daemon-owned feature workflow orchestration layer above prerequisite managers.
5. Keep the current OpenClaw plugin manager as the prerequisite manager for WeChat Work.
6. Add personal WeChat as a distinct `wechat` feature using the external installer command and a QR-first workflow.
7. Add shared workflow session contracts and event handling for long-running feature setup.
8. Update onboarding and config clients to render WeChat Work and WeChat as distinct products.
9. Verify migration, daemon workflow behavior, plugin behavior, and client parity.
