# ADR 0003: macOS-first MVP

## Status

Accepted

## Context

ChillClaw must get non-technical users to a useful result quickly. Cross-platform packaging would dilute the initial reliability work.

## Decision

v0.1 optimizes for a supported macOS environment with single-user local operation, first-party daily-use UI, starter office-work skills, health checks, updates, and recovery.

## Consequences

- Packaging and QA stay narrow enough for an MVP
- Platform assumptions can be explicit in install and repair flows
- Windows and Linux support remain future work and should not leak into core UX decisions
