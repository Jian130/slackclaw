# ADR 0004: Native macOS client over the local daemon

## Status

Accepted

## Context

ChillClaw is macOS-first, local-first, and aimed at non-technical users. The browser-served packaged experience was useful for bootstrapping the product, but it leaves too much macOS lifecycle, windowing, and recovery behavior outside the first-party app shell.

## Decision

The packaged macOS app uses a native SwiftUI client as the primary user experience while keeping the existing local daemon as the only product backend.

The client boundary remains:

`native UI -> ChillClaw daemon -> EngineAdapter -> engine`

The React UI remains in the repo as:

- the fallback packaged surface
- the developer surface
- a parity reference during native-client rollout

The native macOS client is organized as:

- `apps/macos-native`: the SwiftUI app target
- `apps/shared/ChillClawKit`: shared Swift protocol, daemon client, and chat UI packages

The native client may manage:

- app shell and navigation
- daemon endpoint resolution
- LaunchAgent and daemon process attachment/start behavior
- native chat presentation
- native macOS windowing and recovery UX

The native client must not:

- call OpenClaw directly
- bypass the ChillClaw daemon for engine operations
- copy engine logic out of the daemon

## Consequences

- ChillClaw gets a first-party native macOS experience without breaking the daemon-backed product boundary
- React stays useful for development and fallback without becoming a competing backend path
- Future native clients, including Windows, can follow the same daemon-backed pattern
- Packaging must bundle both the native app client and the daemon/runtime resources
