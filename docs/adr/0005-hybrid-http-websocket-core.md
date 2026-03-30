# ADR 0005: Hybrid HTTP and WebSocket daemon transport

## Status

Accepted

## Context

SlackClaw now has multiple first-party clients:

- `apps/desktop-ui` as the browser-based and fallback React client
- `apps/macos-native` as the packaged SwiftUI macOS client
- `apps/shared/SlackClawKit` as the shared Swift protocol/client layer for native clients

Those clients all talk to the same daemon-backed product surface in `apps/daemon`.

The daemon already had a strong request/response API for install, onboarding, configuration, AI employee management, diagnostics, and health. It also already maintained an internal live bridge to the OpenClaw gateway for chat and runtime behavior.

The missing piece was a single client-facing push channel that could deliver fast live updates without turning the whole product API into a custom socket RPC layer.

## Decision

SlackClaw will use a hybrid transport model:

- UI clients use HTTP for commands, authoritative reads, and fresh reloads.
- UI clients use one daemon WebSocket endpoint at `/api/events` for live push updates.
- Only the daemon talks to the OpenClaw gateway WebSocket directly.
- The daemon remains the single product control plane between UI clients and the engine/runtime.

This preserves the existing boundary:

`UI -> local daemon -> EngineAdapter -> engine`

It also aligns with the four-manager engine seam:

- `instances`
- `config`
- `aiEmployees`
- `gateway`

## Adapter implications

The daemon-side infrastructure seams should be explicit:

- `apps/daemon/src/platform/cli-runner.ts`
- `apps/daemon/src/platform/openclaw-gateway-socket-adapter.ts`
- `apps/daemon/src/platform/filesystem-state-adapter.ts`
- `apps/daemon/src/platform/secrets-adapter.ts`

These adapters stay daemon-internal. UI clients do not use them directly.

## Consequences

### Positive

- React, SwiftUI, and future Windows clients can share one daemon API model.
- HTTP remains simple and cache-friendly for deterministic reads and writes.
- WebSocket provides low-latency progress, gateway status, chat, and recovery updates.
- The OpenClaw gateway socket remains internal to the daemon, so native and web clients stay OpenClaw-agnostic.

### Negative

- SlackClaw must maintain both HTTP and WebSocket client libraries.
- Some product flows now have two surfaces:
  - authoritative HTTP reads
  - push-oriented event updates

## Rules

- Do not move product mutations to WebSocket RPC by default.
- Do not let frontend clients connect to OpenClaw directly.
- Keep HTTP as the source of truth for refresh and reconcile behavior.
- Use the daemon WebSocket for push updates, not for replacing the whole API surface.
