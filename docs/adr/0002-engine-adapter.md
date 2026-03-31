# ADR 0002: Narrow engine adapter seam

## Status

Accepted

## Context

ChillClaw starts with OpenClaw but must remain able to switch to engines such as ZeroClaw or IronClaw later.

## Decision

All engine operations flow through a narrow `EngineAdapter` contract.

Internally, that adapter is composed into four engine-neutral managers:

- `instances`: deployment target detection plus install, update, uninstall, and reuse strategy
- `config`: static engine configuration such as models, channels, skills, workspace-level config, and tool policy
- `aiEmployees`: product-managed OpenClaw agent configuration plus per-agent workspace scaffolding
- `gateway`: live gateway lifecycle, health, chat, pairing/login sessions, and apply/restart behavior

Config and AI-employee mutations are staged writes. They update engine config or agent workspace state immediately without requiring the gateway to be running. The gateway manager is the only live-apply boundary and is solely responsible for reload/restart plus reachability verification.

Engine-specific files, commands, and wire formats are confined to adapter implementations.

The same seam should later support local-LLM runtime adapters, including self-hosted model families such as Qwen and other local or OpenAI-compatible runtimes. Provider- or model-specific configuration must not leak into the product layer unless a user-facing requirement clearly justifies it.

## Consequences

- ChillClaw product logic avoids direct dependency on OpenClaw internals
- Product services can depend on the relevant manager boundary without dragging gateway checks into config-only workflows
- Future engine swaps still require adapter work, but not product-layer rewrites
- Deep engine-specific features remain out of scope until they justify expanding the contract
- Future local-LLM integrations should look like adapter additions, not architectural exceptions
