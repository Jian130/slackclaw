# AGENTS.md

## Purpose

ChillClaw is a local-first product layer on top of OpenClaw. Its job is to make OpenClaw usable for non-technical people through guided install, onboarding, daily task flows, health checks, updates, and recovery.

This file defines the operating rules for agents working in this repository.

## Operating principles

- Use first-principles reasoning. Start from the user problem and the system constraints, not from existing implementation habits.
- Be direct. State tradeoffs, risks, and constraints plainly.
- Move fast by reducing complexity and rework, not by skipping verification.
- Solve root causes. Do not paper over broken flows with extra toggles, retries, or UI noise.
- Hold a high bar for clarity, reliability, and polish.
- Ruthlessly focus on shipping useful product behavior.

## Product priorities

- Optimize for ordinary users, not operators or developers.
- Normal use must not require a terminal.
- Treat “first useful result in under 15 minutes” as a core product constraint.
- Prefer clarity, reliability, and recovery over feature breadth.
- Keep the product opinionated. Do not expose raw engine complexity unless there is a strong user need.
- Default to a local-first, single-user trust boundary unless the task explicitly requires something broader.

## Naming

- Use **ChillClaw** in product-facing copy, docs, and new code.
- Use `openclaw` only for upstream CLI commands, binaries, package names, config keys, and filesystem paths.
- If legacy **ChillClaw** names still exist in the repo, do not introduce new ones. Rename only when it is safe and in scope.

## Architecture boundaries

- Preserve the `UI -> local daemon/core -> EngineAdapter -> engine` boundary.
- Do not let frontend code call OpenClaw directly.
- Do not let product-layer daemon code depend on OpenClaw-specific internals outside the adapter implementation.
- Keep engine-specific logic confined to the adapter/integration layer.
- If adding a new engine later, implement the existing adapter seam first instead of branching product logic throughout the codebase.
- Treat future local-LLM backends as adapter work, not as a reason to leak engine-specific configuration into the whole app.
- Keep the Core service headless-capable so the same backend can later power an appliance-style deployment.

## Client rules

### Shared rules for macOS, Windows, and web

- The native macOS app, native Windows app, and local React web interface are peer clients of the same daemon APIs.
- React is a client surface, not a second backend.
- Use HTTP for command and query APIs, and the daemon WebSocket event bus for live updates.
- Keep the raw OpenClaw gateway socket daemon-internal.
- Keep daemon routes and contracts stable when possible. Add only the minimum metadata needed for client parity rather than inventing client-specific backend behavior.
- Keep provider lists, onboarding steps, status surfaces, settings, and recovery actions aligned across all clients through shared contracts and daemon-owned metadata.
- Do not re-implement onboarding, health classification, update policy, or recovery logic separately in each client.
- All clients must clearly distinguish between:
  - installed runtime
  - staged config or pending apply
  - live applied state
- Do not embed browser views for core product flows when a native screen exists. Native chat, onboarding, settings, and recovery should stay native on native clients.

### Native macOS rules

- The macOS app is a native SwiftUI client on top of the local daemon, not a direct OpenClaw client.
- Prefer SwiftUI for product surfaces and use AppKit only when SwiftUI is insufficient.
- Prefer the Observation framework (`@Observable`, `@Bindable`) over introducing new `ObservableObject` or `@StateObject` patterns unless compatibility requires otherwise.
- Use platform-native lifecycle management for the packaged daemon, such as a per-user `LaunchAgent`, instead of ad hoc shell processes.
- Packaged runtime data should live under `~/Library/Application Support/ChillClaw`.

### Native Windows rules

- The Windows app is a native client on top of the local daemon, not a direct OpenClaw client.
- Use standard Windows per-user startup and app-data locations. Do not rely on console windows or ad hoc background shell processes for normal lifecycle management.
- Keep transport and daemon-client code separate from view state and UI-thread concerns.
- Packaged runtime data should live under `%LocalAppData%\ChillClaw`.

### Local web interface rules

- The local React UI is the fallback and developer-friendly surface.
- Do not move business logic into React for convenience.
- Treat the local web interface as another view of the same daemon truth, not as a separate product model.
- All web UI changes must remain responsive across desktop and narrow-screen layouts.

## UI system rules

- New UI work must start from the shared primitive families before adding page-specific visuals: `SurfaceCard`, `StatusBadge`, `TagBadge`, `MetricCard`, `InfoBanner`, `ProgressBar`, `ActionButton`, `SettingRow`, `AvatarView`, `LoadingState`, `EmptyState`, and `ErrorState`.
- New top-level screens must start from an approved scaffold: `WorkspaceScaffold`, `SplitContentScaffold`, `GuidedFlowScaffold`, or `OperationsScaffold`.
- SwiftUI and React implementations may differ technically, but the primitive names, status vocabulary, tone semantics, spacing scale, and scaffold taxonomy must stay aligned across clients.
- Status UI must use the shared `StatusBadge` path. Do not add page-local status chips, ad hoc colored status text, or duplicate status helpers.
- Onboarding and deploy may keep specialized layouts, but they must still be built from shared primitives and the approved flow or operations scaffolds.
- Web semantic tokens are the source of truth for shared web styling. If a shared visual value changes, update `apps/desktop-ui/src/shared/styles/tokens.css` first instead of hardcoding a new value in page or component CSS.
- Corner radius is a system, not a per-screen decoration choice. Define shared semantic radius steps in `apps/desktop-ui/src/shared/styles/tokens.css` and matching `NativeUI` constants or helpers for native clients before using them in page-level code.
- Choose radii by element size group using the shortest side of the shape. Small controls should use the smallest shared radius step, standard controls and compact surfaces should use the middle steps, and only large containers such as cards, dialogs, sheets, and onboarding panels should use the largest steps.
- Page-local radius aliases are allowed only when they map back to shared semantic tokens or a documented derived rule. Do not introduce one-off raw radius values in page CSS, feature-specific CSS variables, or leaf SwiftUI views when an existing shared step fits.
- Reserve pill or max radii such as `999px` or `Capsule()` for true pill and circular shapes, such as badges, toggles, and avatar chrome. Do not use pill radii for generic cards, panels, inputs, or buttons unless the product intentionally wants a pill-shaped control.
- Treat border radii separately from fill radii when a stroke is inset, offset, or drawn on a different layer. Border-specific radii must be derived deliberately from the shape radius, stroke width, and inset instead of copying arbitrary shape values.
- Keep nested surfaces visually aligned. When an inner panel, button, or input sits inside an outer card or dialog, prefer an outer radius that tracks the inner radius plus the visible padding or inset, snapped to the shared radius scale when needed.
- If the radius system changes, update the shared web tokens, the native `NativeUI` radius contract, and the affected shared primitives together. Then verify the main onboarding, dashboard, settings, and dialog flows for nesting or visual regression.
- Reuse shared components and scaffolds before adding new ones. If a page appears to need a one-off primitive, first check whether the existing shared family should be extended instead.

## OpenClaw integration rules

- ChillClaw owns a managed OpenClaw runtime. Do not depend on whatever happens to be on the user’s `PATH`.
- Default to the pinned, tested OpenClaw version selected by ChillClaw, not “latest available” at runtime.
- Reuse an existing compatible ChillClaw-managed runtime when possible, but do not bind product behavior to arbitrary user-installed OpenClaw state.
- During install or repair, normalize OpenClaw back to ChillClaw’s safe local baseline: local mode, loopback bind, token auth, and no inherited remote override.
- If OpenClaw is missing or incompatible, use ChillClaw’s bootstrap and install path rather than inventing a second installer path.
- Distinguish between:
  - OpenClaw runtime installed
  - OpenClaw gateway or service reachable
  - system healthy enough for user work
- Do not report the system as healthy just because the `openclaw` binary exists.
- Installed apps must not assume they are running from a repo checkout. Use runtime path helpers instead of `process.cwd()` assumptions.
- Bootstrap and install logic, update logic, health logic, and recovery logic should each have one canonical implementation path.

## UX and onboarding rules

- Keep install, onboarding, health, update, and recovery messaging in plain language.
- Prefer one primary action per screen or panel.
- Recommend the safest default path first.
- Avoid advanced settings by default.
- When there is a failure, explain three things clearly:
  - what is broken
  - what ChillClaw can do automatically
  - what the user should do next if auto-repair is not enough
- Onboarding should feel like guided setup, not a developer control panel or admin form.
- Use shared design tokens, system fonts, and an 8-point spacing system across clients unless a deliberate product decision says otherwise.
- Use the same language selector behavior across onboarding and the rest of the app. Do not create one-off language controls for individual steps.
- Curated onboarding, provider, and channel metadata should be daemon-owned. Clients should render shared metadata instead of forking it.
- Preserve localized UI support for English, Chinese, Japanese, Korean, and Spanish when changing product copy.

## Health, updates, and recovery

- Prefer repair over diagnosis in user-facing UX.
- Snapshot before update or destructive repair.
- Verify after update. Roll back automatically when verification fails.
- Surface recommended recovery actions first and keep them one-click when possible.
- Operational errors must be written to logs, not only returned to the UI.
- Diagnostics export should include version info, health summary, and relevant logs.
- In development mode, external commands must be echoed before they run so install, update, repair, and bootstrap behavior stays observable.

## Security and data handling

- Store provider credentials in the OS secure store only.
- Pass secrets to OpenClaw by reference or environment injection when possible, not as plain-text config values.
- Never log secrets or include them in support bundles.
- Never commit real credentials, live config values, phone numbers, or user data.
- Keep the default trust boundary local and single-user unless a broader scope is explicitly required.

## Code quality and implementation

- Prefer strict typing and explicit contracts. Avoid `any` and do not use `@ts-nocheck`.
- Keep files focused. Extract helpers or modules instead of cloning “v2” copies of logic.
- Add brief comments for tricky or non-obvious logic.
- Prefer composition, clear interfaces, and explicit seams over hidden cross-layer shortcuts.
- Keep product-layer code OpenClaw-agnostic outside the adapter layer.
- When adding a new provider, channel, or engine capability, update every affected user surface and documentation together so the product stays aligned.
- Use American English in code, comments, docs, and UI copy.

## Testing and verification

- Run the repository’s build and test commands after substantial changes.
- For JS or TS changes, run `npm run build` and `npm test` unless the repo defines a different canonical command.
- If changing installer, packaging, startup, or runtime-management behavior, run the relevant packaging or smoke path too.
- If changing native macOS or Windows code, run the native build or test target and smoke the changed user flow.
- If changing local startup behavior, verify the dev start and stop flow still manages the daemon cleanly and emits clear step-by-step output.
- Prefer validating real OpenClaw status and health behavior through the adapter when practical.
- Never claim a bug is fixed without evidence. For bug fixes, verify the symptom, identify the root cause in code, and add a regression test or clear manual proof.

## Repo hygiene and multi-agent safety

- In chat replies, use repo-root-relative file paths only.
- Keep commits scoped, truthful, and action-oriented.
- Commit only your changes unless explicitly asked to commit everything.
- Do not stash, rewrite, or discard unrelated work.
- Do not switch branches, rewrite history, or alter worktrees unless explicitly asked.
- When unrecognized files are present, leave them alone unless they are part of the requested change.
- If you add an `AGENTS.md` in a subdirectory, add a matching `CLAUDE.md` symlink to it.

## Documentation and decision records

- Update `README.md` when install, runtime, packaging, or architecture behavior changes.
- Every new `CHANGELOG.md` batch entry must include a timestamp in `YYYY-MM-DD HH:MM TZ` format.
- Keep ADRs aligned when a core architectural rule changes.
- Preserve future engine-swappability assumptions.
- Packaging and release steps should be reproducible from scripts, not only from IDE or manual steps.

## Scope control

- Do not chase full OpenClaw feature parity.
- Do not turn ChillClaw into a generic developer control panel.
- Do not widen the engine adapter contract unless a concrete product need justifies it.
- Do not add multi-user admin, hosted sync, or channel sprawl to the MVP path unless explicitly requested.
- If future local-LLM support is added, keep it inside the install, lifecycle, health, and task abstraction instead of scattering raw model configuration across the app.
