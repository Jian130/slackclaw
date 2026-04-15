# Runtime Manager

This document is the project reference for ChillClaw-managed prerequisite runtimes.

The Runtime Manager lives in the daemon and owns generic runtime lifecycle work that should not be duplicated by deploy, onboarding, local AI, or client code.

Runtime artifacts that need HTTP or file transfer are delegated to the daemon Download Manager. The Runtime Manager still decides which resource/version/platform artifact is required; the Download Manager owns queueing, dedupe, resume, checksum verification, temp files, final placement, and download events.

## Goals

- Minimize first-run download time by preferring packaged runtime artifacts.
- Keep normal use terminal-free on clean Macs.
- Install and update only ChillClaw-approved runtime versions.
- Preserve the `UI -> local daemon -> EngineAdapter -> engine` boundary.
- Keep model weights outside the app bundle and outside generic runtime updates.
- Make runtime repair and rollback predictable enough for non-technical users.

## Resource model

Initial resources:

| Resource id | Kind | Owner boundary | Notes |
| --- | --- | --- | --- |
| `node-npm-runtime` | `node-npm` | Runtime Manager provider | Provides daemon-managed Node/npm for managed OpenClaw and npm-backed recovery paths. |
| `openclaw-runtime` | `engine` | Runtime Manager + `OpenClawAdapter` | Runtime Manager provides the managed executable/runtime. `OpenClawAdapter` owns OpenClaw config baseline, gateway restart, reachability, and product behavior. |
| `ollama-runtime` | `local-ai-runtime` | Runtime Manager provider + local model service | Installs or updates Ollama itself. Model pulls stay in local model runtime state. |
| `local-model-catalog` | `model-catalog` | Runtime Manager provider | Metadata-only. Never downloads model weights. |

Future resource ids may include model-specific resources such as `ollama-model:<tag>` or another local AI backend. New resource kinds should be added only when the existing kind taxonomy cannot represent the product behavior clearly.

Runtime statuses:

- `missing`
- `bundled-available`
- `installed`
- `staged-update`
- `updating`
- `ready`
- `degraded`
- `failed`
- `rollback-required`

Runtime actions:

- `prepare`
- `repair`
- `check-update`
- `stage-update`
- `apply-update`
- `rollback`
- `remove`

## Manifest inputs

The packaged baseline is `runtime-manifest.lock.json` at the repo root and, in packaged app builds, under:

`Contents/Resources/app/runtime-artifacts/runtime-manifest.lock.json`

The daemon resolves manifest paths with:

- `CHILLCLAW_RUNTIME_BUNDLE_DIR`
- `CHILLCLAW_RUNTIME_MANIFEST_PATH`
- optional `CHILLCLAW_RUNTIME_UPDATE_FEED_URL`

The packaged manifest is the safe baseline. The optional feed is a ChillClaw-curated update source, not an upstream "latest" lookup.

Each manifest resource may define:

- resource id, kind, version, display name, and description
- source policy: bundled, download, or existing managed
- update policy
- dependencies
- platform constraints
- artifact URLs, relative packaged paths, sha256 digests, and archive type
- provider-specific verification metadata

Relative artifact paths resolve under the manifest directory. In packaged app builds this means under `Contents/Resources/app/runtime-artifacts`.

Packaged runtime artifacts should be runnable CLI payloads, not GUI apps or installers. For example, Node should be an extracted Node distribution directory and Ollama should be an `ollama` CLI file or CLI tarball, not `Ollama.app` or `Ollama.dmg`.

Release packaging prepares those payloads with:

`npm run prepare:runtime-artifacts`

That script fills `runtime-artifacts/node/...` with the runnable Node.js distribution and `runtime-artifacts/ollama/ollama` with the runnable Ollama CLI. It rejects installer/UI payloads such as `.app`, `.dmg`, and `.pkg` files.

## Lifecycle

### Prepare and repair

`prepare` installs a resource and its dependencies in order. Bundled artifacts win over downloads when present and supported by the current platform.

`repair` re-runs the same provider preparation path for a broken resource. It should converge the resource back to the packaged or approved baseline rather than invent a second installer path.

### Check and stage updates

`check-update` compares the installed version with the curated update feed.

`stage-update` requests the approved artifact through the Download Manager or copies an already-packaged artifact into staging state without changing the active install. Staging must pass digest verification before the resource is reported as staged.

On daemon startup and then on a cached interval, the server may silently call the Runtime Manager's approved-update staging path. This stages only already-installed resources whose update policy allows silent staging.

### Apply and rollback

`apply-update` snapshots the active version, installs the staged version into a versioned location, runs provider verification, and switches the active state only after verification succeeds.

If verification fails, the Runtime Manager restores the previous active version in state, marks the resource `rollback-required`, and leaves enough staged metadata for follow-up repair or explicit retry.

`rollback` restores the previous recorded version when a failed apply leaves the resource in rollback state.

## API surface

HTTP routes:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/runtime/resources` | Return the Runtime Manager overview. |
| `POST` | `/api/runtime/resources/:resourceId/prepare` | Prepare a prerequisite. |
| `POST` | `/api/runtime/resources/:resourceId/repair` | Repair a prerequisite. |
| `POST` | `/api/runtime/resources/:resourceId/check-update` | Check the curated update feed for one resource. |
| `POST` | `/api/runtime/resources/:resourceId/stage-update` | Stage an approved update without changing active install. |
| `POST` | `/api/runtime/resources/:resourceId/apply-update` | Apply a staged update with provider verification and rollback on failure. |
| `POST` | `/api/runtime/resources/:resourceId/rollback` | Restore previous recorded runtime version. |

Daemon events:

- `runtime.progress`
- `runtime.completed`
- `runtime.update-staged`

Shared contracts:

- `RuntimeResourceId`
- `RuntimeResourceKind`
- `RuntimeResourceStatus`
- `RuntimeSourcePolicy`
- `RuntimeUpdatePolicy`
- `RuntimeManagerOverview`
- `RuntimeResourceOverview`
- `RuntimeJobProgress`
- `RuntimeActionResponse`

`ProductOverview.runtimeManager` carries the same overview snapshot for dashboard/settings-style surfaces.

## Integration boundaries

### OpenClaw

Managed-local OpenClaw install asks the Runtime Manager to prepare `openclaw-runtime`.

The Runtime Manager provides the executable/runtime. `OpenClawAdapter` still owns:

- `openclaw --version` checks
- gateway config baseline normalization
- local loopback bind and token auth baseline
- gateway restart
- gateway reachability and health classification
- provider, channel, skill, task, chat, and AI employee behavior

System OpenClaw installs are still deployment targets, but Runtime Manager updates apply only to ChillClaw-managed runtime resources.

### Node/npm

The managed Node/npm provider wraps the existing managed Node runtime helper and can install from a bundled runnable Node distribution before falling back to the approved download source.

The provider verifies both `node --version` and `npm --version`.

### Ollama and local models

The Runtime Manager installs and updates the Ollama CLI only. It does not bundle or install the Ollama GUI app.

`LocalModelRuntimeService` still owns:

- host support checks
- model recommendations
- local-runtime progress snapshots for current clients
- Download Manager job coordination for Ollama model pulls
- OpenClaw local model entry handoff

Ollama updates must not delete or replace the managed model directory.

### Local model catalog

The model catalog provider updates metadata only. It must not imply a model pull.

## Packaging

macOS packaging stages runtime metadata and runnable CLI artifacts under:

`Contents/Resources/app/runtime-artifacts`

The LaunchAgent installer writes runtime environment entries for:

- `CHILLCLAW_RUNTIME_BUNDLE_DIR`
- `CHILLCLAW_RUNTIME_MANIFEST_PATH`
- `CHILLCLAW_RUNTIME_UPDATE_FEED_URL`

Stable release packaging runs `npm run prepare:runtime-artifacts` before staging the app, then requires the packaged Node.js directory and Ollama CLI binary to be present. Local smoke builds may still run without prefilled artifacts when testing only installer structure.

## Testing expectations

Runtime Manager tests should cover:

- bundled artifact preference over download fallback
- digest mismatch blocking install/update
- dependency ordering, especially Node before OpenClaw
- staged updates leaving the active install untouched
- failed apply restoring previous active version
- unsupported platform reporting clear failure
- background staging only staging installed resources with approved update policy

Provider tests should cover:

- Node/npm binary verification
- OpenClaw CLI and adapter gateway health verification
- Ollama CLI/API verification and model directory preservation
- catalog metadata update without model-weight download

Packaging tests should cover:

- staged app includes `runtime-artifacts/runtime-manifest.lock.json`
- LaunchAgent installer includes runtime env vars
- packaged executable runtime artifacts keep required executable permissions and entitlements
