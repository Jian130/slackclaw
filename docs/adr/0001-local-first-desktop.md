# ADR 0001: Local-first desktop control plane

## Status

Accepted

## Context

SlackClaw targets non-technical users who need installation, onboarding, task execution, health visibility, and recovery without using a terminal. The product must later support a mini desktop appliance.

## Decision

SlackClaw will use a local-first architecture:

- a first-party UI served as a desktop-ready React application
- a localhost daemon that owns orchestration, policy, health checks, recovery, and diagnostics
- a future Tauri shell as packaging and OS integration layer

## Consequences

- The UI can iterate independently of the engine implementation
- The daemon becomes the durable product control plane for future appliance deployments
- Tauri packaging is deferred until the Rust toolchain is present, but the architecture remains compatible
