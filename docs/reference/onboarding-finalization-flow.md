# Onboarding Finalization Flow

This reference documents the current final step of ChillClaw onboarding and reviews where the process can be simplified.

The final user-facing input step is `employee`. The completion screen is a result state shown after the daemon finishes `POST /api/onboarding/complete`.

## Current Step Contract

Current primary onboarding steps:

```text
welcome -> install -> model -> channel -> employee
```

The final step has two related but different actions:

- Save employee draft:
  `POST /api/onboarding/employee`
- Finalize onboarding:
  `POST /api/onboarding/complete`

`POST /api/onboarding/complete` accepts:

```ts
{
  destination?: "team" | "dashboard" | "chat";
  employee?: OnboardingEmployeeState;
}
```

The normal "Create AI employee" path sends `employee`. Destination buttons after completion only navigate if the client already has a completed onboarding response.

## Web Client Path

Employee form autosave:

```text
OnboardingPage employee form changes
-> 250ms autosave effect
-> saveEmployeeDraftToDaemon(employee)
-> saveOnboardingEmployeeDraft(employee)
-> POST /api/onboarding/employee
-> OnboardingService.saveEmployeeDraft(employee)
```

Final create action:

```text
handleCreateEmployee()
-> validate selectedBrainEntryId, selectedEmployeePreset, employeeName, employeeJobTitle
-> build employee draft from selected preset and identity fields
-> completeOnboarding({ employee: draft })
-> POST /api/onboarding/complete
-> setOverview(result.overview)
-> setCompletedOnboarding(result)
-> setCompletionWarmupTaskId(result.warmupTaskId ?? "")
-> show completion screen
```

Destination action after completion:

```text
handleComplete(destination)
-> if showingCompletion:
     navigate(onboardingDestinationPath(destination, completed employee id))
-> else:
     completeOnboarding({ destination })
     navigate(onboardingDestinationPath(destination, result employee id))
```

Important web files:

- `apps/desktop-ui/src/features/onboarding/OnboardingPage.tsx`
- `apps/desktop-ui/src/shared/api/client.ts`

## Native Client Path

Employee form autosave:

```text
persistEmployeeDraft()
-> scheduleEmployeeDraftPersistence(revision, employeeBuilder)
-> saveEmployeeDraftToDaemon(employee)
-> ChillClawAPIClient.saveOnboardingEmployee(employee)
-> POST /api/onboarding/employee
-> OnboardingService.saveEmployeeDraft(employee)
```

Final create action:

```text
createEmployee()
-> guard !employeeBusy
-> validate selectedBrainEntryId, selectedEmployeePreset, employeeName, employeeJobTitle
-> build OnboardingEmployeeState
-> appState.client.completeOnboarding(.init(employee: employeeState))
-> POST /api/onboarding/complete
-> applyCompletedOnboarding(result)
```

`applyCompletedOnboarding(result)`:

```text
-> appState.applyOverviewSnapshot(result.overview)
-> applyPreferredChatMember(result.summary.employee.memberId)
-> completedOnboarding = result
-> completionWarmupTaskID = result.warmupTaskId
-> completionWarmupStatus = running when warmupTaskId exists
-> completionWarmupMessage = "Finishing workspace setup in the background."
```

Destination action:

```text
complete(destination)
-> if destination disabled, show error
-> if showingCompletion:
     enterDestination(destination)
-> else:
     appState.client.completeOnboarding(.init(destination: destination))
     enterDestination(destination)
```

Native blocks Chat while the completion warmup exists and is not completed.

Important native files:

- `apps/macos-native/Sources/ChillClawNative/OnboardingViewModel.swift`
- `apps/shared/ChillClawKit/Sources/ChillClawClient/APIClient.swift`
- `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Requests.swift`
- `apps/shared/ChillClawKit/Sources/ChillClawProtocol/Models.swift`

## Daemon Routes

Employee draft route:

```text
POST /api/onboarding/employee
-> readJson<OnboardingEmployeeState>(request)
-> traceOnboardingRoute("POST /api/onboarding/employee", ...)
-> context.onboardingService.saveEmployeeDraft(body)
```

Completion route:

```text
POST /api/onboarding/complete
-> readJson<CompleteOnboardingRequest>(request)
-> traceOnboardingRoute("POST /api/onboarding/complete", ...)
-> context.onboardingService.complete(body)
```

Important daemon files:

- `apps/daemon/src/routes/onboarding.ts`
- `apps/daemon/src/services/onboarding-service.ts`

## Daemon Completion Flow

Normal employee finalization path:

```text
OnboardingService.complete(request)
-> if setup already completed and completion operation completed:
     return completed overview
-> startOperation("completion", "onboarding-completion", "preparing", ...)
-> readResolvedDraftState()
-> completionDraft = draft plus normalized(request.employee ?? draft.employee)
-> skipToDashboard = request.destination === "dashboard"
-> if skipToDashboard:
     buildSummary(completionDraft)
-> else:
     buildFinalizeSummary(completionDraft)
     assertReadyForFinalize(completionDraft, summary)
     prepareLocalRuntimeModelForFinalize(summary.model ?? completionDraft.model)
     adapter.config.canReuseSavedModelEntry(brainEntryId)
     maybe resolveSavedModelForFinalize(...)
     resolvePresetSkillIds(employee)
     createWarmupTaskId()
     setOperation(... phase: "creating-employee")
     publishWarmupProgress(... "Creating your AI employee")
     aiTeamService.saveMemberForOnboarding(...)
     persist created employee draft in StateStore
     maybe aiTeamService.bindMemberChannelForOnboarding(...)
     adapter.aiEmployees.setPrimaryAIMemberAgent(createdMember.agentId)
     setOperation(... phase: "applying-gateway")
     publishWarmupProgress(... "Applying gateway changes")
     adapter.gateway.finalizeOnboardingSetup()
     prepare pending onboarding warmup state
-> store setupCompletedAt
-> clear onboarding draft
-> store pending warmup if one exists
-> startOnboardingWarmup(warmupTaskId) if one exists
-> completeOperation("completion", ...)
-> return CompleteOnboardingResponse
```

Main validation gates in `assertReadyForFinalize()`:

- OpenClaw install is complete.
- First model has a saved entry.
- First channel has a staged entry.
- Employee name and job title are present.

## OpenClaw Adapter Calls

Creating or updating the AI employee:

```text
aiTeamService.saveMemberForOnboarding(...)
-> persistMember(...)
-> adapter.aiEmployees.saveAIMemberRuntime(...)
-> OpenClawAgentsConfigCoordinator.saveAIMemberRuntime(...)
-> readResolvedSavedModelState()
-> readAllModels()
-> listOpenClawAgents()
-> ensureMemberAgent(...)
-> setMemberIdentity(...)
-> writeMemberWorkspaceFiles(...)
-> syncMemberBrain(...)
```

Binding the first channel:

```text
aiTeamService.bindMemberChannelForOnboarding(memberId, { binding })
-> adapter.aiEmployees.bindAIMemberChannel(agentId, { binding })
-> OpenClawAgentsConfigCoordinator.bindMemberChannelExclusively(...)
-> openclaw agents unbind ... --json  (only for conflicting owners)
-> openclaw agents bind --agent ... --bind ... --json
```

Promoting the first AI employee as primary:

```text
adapter.aiEmployees.setPrimaryAIMemberAgent(agentId)
-> OpenClawAdapter.setPrimaryAIMemberAgent(agentId)
-> readOpenClawConfigSnapshot()
-> writeOpenClawConfigSnapshot(...)
-> markGatewayApplyPending()
```

Final gateway apply:

```text
adapter.gateway.finalizeOnboardingSetup()
-> OpenClawRuntimeLifecycleService.finalizeOnboardingSetup()
-> status()
-> gatewayInstalled()
-> if gateway installed, running, and no pending apply:
     return current engine status
-> restartGatewayAndRequireHealthy("onboarding completion")
```

## Background Warmup

After the completion response is prepared, the daemon starts a retained warmup job:

```text
startOnboardingWarmup(warmupTaskId)
-> runOnboardingWarmup(taskId)
-> readOnboardingWarmup(taskId)
-> update warmup status: running, "Verifying preset skills"
-> aiTeamService.markOnboardingWarmupProgress(...)
-> presetSkillService.setDesiredPresetSkillIds("onboarding", presetSkillIds, waitForReconcile: true)
-> update warmup status: running, "Indexing memory"
-> aiTeamService.finalizeOnboardingWarmup(memberId)
-> update warmup status: running, "Applying gateway changes"
-> adapter.gateway.finalizeOnboardingSetup()
-> update warmup status: completed, "Workspace ready"
-> publishTaskProgress(taskId, "completed", "Workspace ready")
```

`aiTeamService.finalizeOnboardingWarmup(memberId)` verifies selected skills, writes the final OpenClaw member runtime, indexes memory, updates the stored member, and publishes an AI team snapshot.

Clients receive warmup state through daemon `task.progress` events.

## Timeout Recovery

Web completion timeout recovery:

```text
recoverOnboardingTimeout(error, "completion")
-> if not timeout: return false
-> refreshOnboardingState()
-> read next.operations.completion
-> show operation message
```

Native completion timeout recovery:

```text
recoverOnboardingCompletionAfterTimeout(error, destination)
-> if not recoverable timeout: return false
-> poll readOverviewSnapshot() up to 12 times
-> if overview.firstRun.setupCompleted:
     synthesize CompleteOnboardingResponse
     applyCompletedOnboarding(...)
     maybe enterDestination(destination)
-> otherwise refresh onboarding state between attempts
```

## Simplification Review

### Finding 1: Completion does too many jobs

`POST /api/onboarding/complete` currently means all of these depending on payload and state:

- lightweight skip to dashboard when `destination === "dashboard"`
- final employee creation when `employee` is present
- destination navigation when `destination` is present
- idempotent completed-state read when onboarding is already complete

That makes client code harder to reason about and creates edge cases. For example, the web header skip currently calls `handleComplete("team")` on early steps, but the daemon only treats `destination: "dashboard"` as the skip path. Before the final gates are satisfied, `destination: "team"` still goes through full finalization and can fail.

Recommended cleanup:

- Use one explicit route for final setup, for example `POST /api/onboarding/finalize`.
- Use one explicit route for skipping incomplete onboarding, for example `POST /api/onboarding/skip`, and make it dashboard-only.
- Treat destination selection after completion as client navigation, not a daemon mutation.

### Finding 2: Gateway finalization happens twice

The daemon calls `adapter.gateway.finalizeOnboardingSetup()` during the synchronous completion request, then the background warmup calls it again after preset skills and memory indexing.

The second call is often a no-op, but the process is not clean: the UI says setup is complete while a retained job is still applying gateway changes.

Recommended cleanup:

- Choose one owner for gateway finalization.
- Prefer moving final gateway apply to the warmup job if Chat remains disabled until warmup completes.
- If synchronous finalization is kept, remove the warmup gateway finalization and make warmup only verify preset skills and index memory.

### Finding 3: Web and native completion behavior diverge

Native blocks Chat until the warmup task completes. Web shows warmup status, but destination cards do not enforce the same Chat gate in the current completion screen.

Recommended cleanup:

- Share one completion destination policy across clients.
- Chat should be disabled until warmup status is `completed`.
- Team and Dashboard can stay available while warmup runs if product wants a faster perceived finish.

### Finding 4: Timeout recovery is split between clients

Web refreshes onboarding state and reads `operations.completion`. Native polls overview until `firstRun.setupCompleted` is true, then synthesizes a completion response.

Recommended cleanup:

- Add a daemon-owned completion status surface, either in `GET /api/onboarding/state` while completion is running or as `GET /api/onboarding/complete/status`.
- Return the same fields both clients need: operation, setupCompleted, summary, overview snapshot, warmupTaskId.
- Let both clients use the same recovery rule.

### Finding 5: Employee draft and final payload overlap

Autosave is useful for resume, but finalization also sends the full employee payload. This is acceptable, but the naming should make the split clear.

Recommended cleanup:

- Keep autosave as resume-only draft persistence.
- Make the final submit the authoritative payload for employee creation.
- Do not require clients to fetch fresh state before finalization.

## Clean Target Process

Recommended final process:

```text
Employee step loads
-> client renders daemon-owned employee presets
-> client autosaves draft for resume only
-> user clicks Create AI employee
-> client posts full final payload to POST /api/onboarding/finalize
-> daemon validates install/model/channel/employee gates
-> daemon creates or updates the first AI employee
-> daemon binds the staged channel
-> daemon sets the primary AI employee
-> daemon stores setupCompletedAt and clears onboarding draft
-> daemon returns completion summary, overview, and warmupTaskId
-> daemon warmup verifies preset skills, indexes memory, and performs the single gateway final apply
-> UI shows completion screen
-> Team and Dashboard are available
-> Chat becomes available when warmup status is completed
```

Recommended skip process:

```text
User clicks Skip
-> client posts POST /api/onboarding/skip
-> daemon marks setupCompletedAt without creating employee
-> daemon clears onboarding draft
-> daemon returns overview
-> client opens Dashboard
```

This keeps the final step clean: one button creates the first useful AI employee, one retained warmup prepares the workspace, and destination buttons only move the user after the setup state is known.
