# ADR 0002: Narrow engine adapter seam

## Status

Accepted

## Context

SlackClaw starts with OpenClaw but must remain able to switch to engines such as ZeroClaw or IronClaw later.

## Decision

All engine operations flow through a narrow `EngineAdapter` contract covering:

- deployment target detection plus install, update, and uninstall orchestration
- install and configure
- runtime model and channel management
- lifecycle control
- task execution and event streaming
- health checks
- updates and recovery
- diagnostics export

Engine-specific files, commands, and wire formats are confined to adapter implementations.

The same seam should later support local-LLM runtime adapters, including self-hosted model families such as Qwen and other local or OpenAI-compatible runtimes. Provider- or model-specific configuration must not leak into the product layer unless a user-facing requirement clearly justifies it.

## Consequences

- SlackClaw product logic avoids direct dependency on OpenClaw internals
- Future engine swaps still require adapter work, but not product-layer rewrites
- Deep engine-specific features remain out of scope until they justify expanding the contract
- Future local-LLM integrations should look like adapter additions, not architectural exceptions
