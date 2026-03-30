# Hybrid Event Bus and Adapter Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor SlackClaw to keep HTTP for command/query APIs, add a UI-facing WebSocket event bus for fast live updates, and extract the remaining filesystem, gateway-socket, CLI, and secrets seams into explicit internal adapters.

**Architecture:** Preserve `UI -> local daemon -> EngineAdapter -> engine`, but change the daemon from a pure request/response hub into a hybrid service: HTTP remains the source of truth for reads and mutations, while one daemon event socket pushes task, install, gateway, and chat updates to React, native macOS, and future Windows clients. Complete the current four-manager engine split by removing the remaining flat compatibility layer and pulling implicit infrastructure seams into first-class adapters.

**Tech Stack:** TypeScript, Node HTTP server, browser WebSocket, Swift `URLSessionWebSocketTask`, existing React client, existing Swift `SlackClawKit`, existing OpenClaw four-manager adapter seam.

---

## File Structure

### New files

- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/cli-runner.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/filesystem-state-adapter.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/secrets-adapter.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/macos-keychain-secrets-adapter.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/openclaw-gateway-socket-adapter.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/event-bus-service.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/event-publisher.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/shared/api/events.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Sources/SlackClawClient/EventStreamClient.swift`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Sources/SlackClawProtocol/EventModels.swift`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Tests/SlackClawKitTests/EventStreamClientTests.swift`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/event-bus-service.test.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/filesystem-state-adapter.test.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/openclaw-gateway-socket-adapter.test.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/macos-keychain-secrets-adapter.test.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/docs/adr/0005-hybrid-http-websocket-core.md`

### Existing files to modify

- Modify: `/Users/home/Ryo/Projects/slackclaw/packages/contracts/src/index.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/packages/contracts/src/index.test.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/server.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/chat-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/setup-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/overview-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/onboarding-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/channel-setup-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/ai-team-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/skill-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/state-store.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/logger.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/adapter.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/openclaw-adapter.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/openclaw-gateway-manager.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/openclaw-config-manager.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/openclaw-instance-manager.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/openclaw-ai-employee-manager.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/registry.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/shared/api/client.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/features/chat/ChatPage.tsx`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/features/deploy/DeployPage.tsx`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/app/providers/AITeamProvider.tsx`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/macos-native/Sources/SlackClawNative/AppState.swift`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/macos-native/Sources/SlackClawNative/OnboardingViewModel.swift`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/macos-native/Sources/SlackClawNative/Screens.swift`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Sources/SlackClawClient/APIClient.swift`
- Modify: `/Users/home/Ryo/Projects/slackclaw/README.md`
- Modify: `/Users/home/Ryo/Projects/slackclaw/AGENTS.md`
- Modify: `/Users/home/Ryo/Projects/slackclaw/CHANGELOG.md`

## Chunk 1: Freeze the hybrid architecture and add shared event contracts

### Task 1: Document the target architecture

**Files:**
- Create: `/Users/home/Ryo/Projects/slackclaw/docs/adr/0005-hybrid-http-websocket-core.md`
- Modify: `/Users/home/Ryo/Projects/slackclaw/README.md`
- Modify: `/Users/home/Ryo/Projects/slackclaw/AGENTS.md`

- [ ] **Step 1: Write the failing documentation diff**

Document these architectural decisions in the ADR draft:

```md
- UI clients use HTTP for commands and fresh reads.
- UI clients use one SlackClaw daemon WebSocket for push events.
- Only the daemon talks to the OpenClaw gateway WebSocket.
- Filesystem/state and secrets become explicit daemon-side adapters.
- The four engine managers remain the engine-facing backbone.
```

- [ ] **Step 2: Save the ADR and doc edits**

Add exact references to:

```md
apps/desktop-ui
apps/macos-native
apps/shared/SlackClawKit
apps/daemon/src/services
apps/daemon/src/platform
apps/daemon/src/engine
```

- [ ] **Step 3: Verify the docs mention HTTP + WebSocket, not “all WebSocket”**

Run: `rg -n "HTTP \\+ WebSocket|all WebSocket|SSE" /Users/home/Ryo/Projects/slackclaw/README.md /Users/home/Ryo/Projects/slackclaw/AGENTS.md /Users/home/Ryo/Projects/slackclaw/docs/adr/0005-hybrid-http-websocket-core.md`
Expected: the new ADR and docs clearly describe the hybrid model.

- [ ] **Step 4: Commit**

```bash
git add /Users/home/Ryo/Projects/slackclaw/docs/adr/0005-hybrid-http-websocket-core.md /Users/home/Ryo/Projects/slackclaw/README.md /Users/home/Ryo/Projects/slackclaw/AGENTS.md
git commit -m "docs: define hybrid daemon transport architecture"
```

### Task 2: Add shared event contracts

**Files:**
- Modify: `/Users/home/Ryo/Projects/slackclaw/packages/contracts/src/index.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/packages/contracts/src/index.test.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Sources/SlackClawProtocol/EventModels.swift`

- [ ] **Step 1: Write the failing contract tests**

Add tests for a shared event envelope like:

```ts
type SlackClawEvent =
  | { type: "deploy.progress"; correlationId: string; targetId: "standard" | "managed-local"; phase: string; percent?: number; message: string }
  | { type: "gateway.status"; reachable: boolean; pendingGatewayApply: boolean; summary: string }
  | { type: "chat.delta"; threadId: string; sessionKey: string; payload: ChatStreamEvent }
  | { type: "task.progress"; taskId: string; status: "pending" | "running" | "completed" | "failed"; message: string };
```

- [ ] **Step 2: Run the contracts test to verify it fails**

Run: `npm test --workspace @slackclaw/contracts -- src/index.test.ts`
Expected: FAIL because the new event types are not exported yet.

- [ ] **Step 3: Add the minimal shared event models**

Export event DTOs from `packages/contracts`, then mirror the same payloads in `EventModels.swift`.

- [ ] **Step 4: Re-run the contracts tests**

Run: `npm test --workspace @slackclaw/contracts -- src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/home/Ryo/Projects/slackclaw/packages/contracts/src/index.ts /Users/home/Ryo/Projects/slackclaw/packages/contracts/src/index.test.ts /Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Sources/SlackClawProtocol/EventModels.swift
git commit -m "feat: add shared daemon event contracts"
```

## Chunk 2: Add the daemon event bus and wire the UI clients to it

### Task 3: Add one daemon-side event bus service and `/api/events`

**Files:**
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/event-bus-service.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/event-publisher.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/event-bus-service.test.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/server.ts`

- [ ] **Step 1: Write the failing event-bus test**

Test these behaviors:

```ts
test("event bus delivers typed events to multiple subscribers", async () => {
  // subscribe two listeners
  // publish one event
  // assert both listeners receive the same payload
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npm test --workspace @slackclaw/daemon -- src/services/event-bus-service.test.ts`
Expected: FAIL because the event bus does not exist yet.

- [ ] **Step 3: Implement the event bus and server route**

Implement:

```ts
class EventBusService {
  subscribe(listener: (event: SlackClawEvent) => void): () => void
  publish(event: SlackClawEvent): void
}
```

Expose a daemon endpoint:

```ts
GET /api/events
```

The route should:
- upgrade to WebSocket
- send JSON event envelopes
- close cleanly when the client disconnects

- [ ] **Step 4: Re-run the targeted daemon test**

Run: `npm test --workspace @slackclaw/daemon -- src/services/event-bus-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/event-bus-service.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/event-publisher.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/event-bus-service.test.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/server.ts
git commit -m "feat: add daemon websocket event bus"
```

### Task 4: Add browser and native event-stream clients

**Files:**
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/shared/api/events.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Sources/SlackClawClient/EventStreamClient.swift`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Tests/SlackClawKitTests/EventStreamClientTests.swift`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/shared/api/client.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Sources/SlackClawClient/APIClient.swift`

- [ ] **Step 1: Write the failing native and web client tests**

Cover:
- browser reconnect behavior
- JSON event decode
- native reconnect backoff
- duplicate subscriber cleanup

- [ ] **Step 2: Run the new client tests to verify they fail**

Run:

```bash
npm test --workspace @slackclaw/desktop-ui -- src/shared/api/events.test.ts
npm run test:mac-native
```

Expected: FAIL because no UI-facing event socket client exists yet.

- [ ] **Step 3: Implement the event clients**

Web:

```ts
export function subscribeToDaemonEvents(
  onEvent: (event: SlackClawEvent) => void
): () => void
```

Swift:

```swift
public final class SlackClawEventStreamClient {
    public func connect() async throws
    public func subscribe(_ handler: @escaping @Sendable (SlackClawEvent) -> Void)
}
```

- [ ] **Step 4: Re-run the targeted client tests**

Run:

```bash
npm test --workspace @slackclaw/desktop-ui -- src/shared/api/events.test.ts
npm run test:mac-native
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/shared/api/events.ts /Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Sources/SlackClawClient/EventStreamClient.swift /Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Tests/SlackClawKitTests/EventStreamClientTests.swift /Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/shared/api/client.ts /Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Sources/SlackClawClient/APIClient.swift
git commit -m "feat: add shared websocket event clients"
```

## Chunk 3: Extract explicit adapters from the daemon and OpenClaw implementation

### Task 5: Extract the filesystem/state adapter

**Files:**
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/filesystem-state-adapter.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/filesystem-state-adapter.test.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/state-store.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/logger.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/onboarding-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/chat-service.ts`

- [ ] **Step 1: Write the failing adapter test**

Cover:

```ts
test("filesystem state adapter reads, writes, and creates parent directories", async () => {
  // read missing state returns default
  // write creates directories
  // read returns persisted state
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace @slackclaw/daemon -- src/platform/filesystem-state-adapter.test.ts`
Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the adapter and refactor callers**

Expose:

```ts
interface FilesystemStateAdapter {
  readJson<T>(path: string, fallback: T): Promise<T>
  writeJson(path: string, value: unknown): Promise<void>
  appendLog(path: string, line: string): Promise<void>
}
```

Refactor `StateStore` and logging to delegate to it instead of directly using `fs/promises`.

- [ ] **Step 4: Re-run the targeted tests**

Run:

```bash
npm test --workspace @slackclaw/daemon -- src/platform/filesystem-state-adapter.test.ts src/services/onboarding-service.test.ts src/services/chat-service.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/filesystem-state-adapter.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/filesystem-state-adapter.test.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/state-store.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/logger.ts
git commit -m "refactor: extract filesystem state adapter"
```

### Task 6: Extract the secrets adapter

**Files:**
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/secrets-adapter.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/macos-keychain-secrets-adapter.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/macos-keychain-secrets-adapter.test.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/openclaw-config-manager.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/channel-setup-service.ts`

- [ ] **Step 1: Write the failing adapter contract test**

Test:

```ts
test("macOS keychain adapter can no-op safely when keychain is unavailable in tests", async () => {
  // missing keychain support should not crash the daemon
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace @slackclaw/daemon -- src/platform/macos-keychain-secrets-adapter.test.ts`
Expected: FAIL because no secrets adapter exists.

- [ ] **Step 3: Implement the generic and macOS adapters**

Expose:

```ts
interface SecretsAdapter {
  get(name: string): Promise<string | undefined>
  set(name: string, value: string): Promise<void>
  delete(name: string): Promise<void>
}
```

Start with a minimal macOS implementation that uses the `security` CLI and falls back safely when unsupported.

- [ ] **Step 4: Re-run the targeted tests**

Run: `npm test --workspace @slackclaw/daemon -- src/platform/macos-keychain-secrets-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/secrets-adapter.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/macos-keychain-secrets-adapter.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/macos-keychain-secrets-adapter.test.ts
git commit -m "refactor: add secrets adapter seam"
```

### Task 7: Extract the CLI runner and gateway-socket adapter

**Files:**
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/cli-runner.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/openclaw-gateway-socket-adapter.ts`
- Create: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/openclaw-gateway-socket-adapter.test.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/openclaw-adapter.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/openclaw-gateway-manager.ts`

- [ ] **Step 1: Write the failing gateway-socket adapter test**

Cover:

```ts
test("gateway socket adapter converts OpenClaw socket envelopes into EngineChatLiveEvent values", async () => {
  // feed mock ws envelopes
  // assert normalized engine events
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test --workspace @slackclaw/daemon -- src/platform/openclaw-gateway-socket-adapter.test.ts`
Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Move the WebSocket bridge and command spawning behind adapters**

Move:
- command execution and logging into `cli-runner.ts`
- OpenClaw gateway socket connect/auth/listen logic into `openclaw-gateway-socket-adapter.ts`

Keep the daemon-facing gateway manager interface unchanged.

- [ ] **Step 4: Re-run the targeted adapter tests**

Run:

```bash
npm test --workspace @slackclaw/daemon -- src/platform/openclaw-gateway-socket-adapter.test.ts src/engine/openclaw-adapter.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/cli-runner.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/openclaw-gateway-socket-adapter.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/platform/openclaw-gateway-socket-adapter.test.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/openclaw-adapter.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/openclaw-gateway-manager.ts
git commit -m "refactor: extract cli and gateway socket adapters"
```

## Chunk 4: Publish live events and finish the manager-only migration

### Task 8: Publish deploy, onboarding, gateway, and task events

**Files:**
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/setup-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/onboarding-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/overview-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/task-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/server.ts`

- [ ] **Step 1: Write failing service tests for event publication**

Add tests proving that:
- install publishes progress and completion
- gateway restart publishes status change
- task execution publishes progress

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test --workspace @slackclaw/daemon -- src/services/setup-service.test.ts src/services/onboarding-service.test.ts src/services/overview-service.test.ts
```

Expected: FAIL because these services do not emit daemon events yet.

- [ ] **Step 3: Implement event publication**

Publish events like:

```ts
eventBus.publish({
  type: "deploy.progress",
  correlationId,
  targetId: "managed-local",
  phase: "installing",
  percent: 50,
  message: "Installing OpenClaw"
});
```

Keep HTTP responses unchanged.

- [ ] **Step 4: Re-run the targeted service tests**

Run:

```bash
npm test --workspace @slackclaw/daemon -- src/services/setup-service.test.ts src/services/onboarding-service.test.ts src/services/overview-service.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/setup-service.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/onboarding-service.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/overview-service.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/task-service.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/server.ts
git commit -m "feat: publish deploy and gateway events"
```

### Task 9: Move chat from UI-facing SSE to the shared event bus

**Files:**
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/chat-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/features/chat/ChatPage.tsx`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/shared/api/client.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/macos-native/Sources/SlackClawNative/Screens.swift`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Sources/SlackClawClient/APIClient.swift`

- [ ] **Step 1: Write the failing chat transport tests**

Cover:
- thread updates arrive over daemon event socket
- chat delta/completed/failed events still update thread detail correctly
- existing HTTP thread fetch remains the source of truth on reconnect

- [ ] **Step 2: Run the chat tests to verify they fail**

Run:

```bash
npm test --workspace @slackclaw/desktop-ui -- src/features/chat/ChatPage.test.tsx
npm run test:mac-native
```

Expected: FAIL because chat still depends on daemon SSE.

- [ ] **Step 3: Switch the clients to shared daemon events**

Keep:
- HTTP thread fetches
- HTTP send/abort/create thread calls

Replace:
- UI-facing SSE subscription with WebSocket daemon event subscription

- [ ] **Step 4: Re-run the targeted chat tests**

Run:

```bash
npm test --workspace @slackclaw/desktop-ui -- src/features/chat/ChatPage.test.tsx
npm run test:mac-native
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/chat-service.ts /Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/features/chat/ChatPage.tsx /Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/shared/api/client.ts /Users/home/Ryo/Projects/slackclaw/apps/macos-native/Sources/SlackClawNative/Screens.swift /Users/home/Ryo/Projects/slackclaw/apps/shared/SlackClawKit/Sources/SlackClawClient/APIClient.swift
git commit -m "refactor: move chat clients to daemon event socket"
```

### Task 10: Finish the manager-only engine seam

**Files:**
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/adapter.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/overview-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/setup-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/onboarding-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/channel-setup-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/ai-team-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/skill-service.ts`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services/chat-service.ts`

- [ ] **Step 1: Write the failing service-level migration tests**

Add/adjust tests so services only use:

```ts
adapter.instances
adapter.config
adapter.aiEmployees
adapter.gateway
```

and no longer rely on the flat compatibility API.

- [ ] **Step 2: Run the daemon tests to verify the seam is still needed**

Run: `npm test --workspace @slackclaw/daemon`
Expected: one or more failing references when the flat methods are removed.

- [ ] **Step 3: Refactor services and remove the flat compatibility methods**

Delete the old methods from `EngineAdapter` only after all service call sites are updated.

- [ ] **Step 4: Re-run full daemon tests**

Run: `npm test --workspace @slackclaw/daemon`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/engine/adapter.ts /Users/home/Ryo/Projects/slackclaw/apps/daemon/src/services
git commit -m "refactor: remove flat engine adapter compatibility surface"
```

## Chunk 5: Wire UI auto-refresh onto events and finish verification

### Task 11: Replace polling-first UI refresh with event-assisted refresh

**Files:**
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/features/deploy/DeployPage.tsx`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src/app/providers/AITeamProvider.tsx`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/macos-native/Sources/SlackClawNative/AppState.swift`
- Modify: `/Users/home/Ryo/Projects/slackclaw/apps/macos-native/Sources/SlackClawNative/OnboardingViewModel.swift`

- [ ] **Step 1: Write failing UI tests for event-assisted refresh**

Cover:
- deploy page updates immediately on progress events and still settles with fresh reads
- onboarding install step advances without waiting for a blind timeout
- AI team overview updates after bind/save/delete events

- [ ] **Step 2: Run the UI tests to verify they fail**

Run:

```bash
npm test --workspace @slackclaw/desktop-ui
npm run test:mac-native
```

Expected: targeted flows fail because they still rely entirely on post-mutation polling.

- [ ] **Step 3: Implement hybrid refresh**

Use:
- immediate mutation response
- event bus for low-latency progress
- fresh HTTP reads as the final authoritative settle step

Do not remove the final fresh-read verification.

- [ ] **Step 4: Re-run the UI tests**

Run:

```bash
npm test --workspace @slackclaw/desktop-ui
npm run test:mac-native
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/home/Ryo/Projects/slackclaw/apps/desktop-ui/src /Users/home/Ryo/Projects/slackclaw/apps/macos-native/Sources/SlackClawNative
git commit -m "feat: switch ui refresh to hybrid event plus fresh-read model"
```

### Task 12: Full regression and packaging verification

**Files:**
- Modify: `/Users/home/Ryo/Projects/slackclaw/CHANGELOG.md`

- [ ] **Step 1: Update the changelog**

Add entries for:
- daemon event bus
- explicit platform adapters
- manager-only engine seam
- native and React client transport changes

- [ ] **Step 2: Run full regression**

Run:

```bash
npm test
npm run build
npm run build:mac-installer
npm start
npm stop
```

Expected:
- all tests pass
- builds pass
- installer build passes
- local start still reports readiness
- local stop clears managed dev processes

- [ ] **Step 3: Smoke-check the critical flows**

Verify manually:
- packaged/native or dev-native app connects to daemon
- deploy install emits progress and finishes
- onboarding install/model/channel/employee flow updates live
- chat streaming works over the daemon event socket
- gateway restart clears pending-apply state

- [ ] **Step 4: Commit**

```bash
git add /Users/home/Ryo/Projects/slackclaw/CHANGELOG.md
git commit -m "chore: finalize hybrid transport and adapter refactor"
```

