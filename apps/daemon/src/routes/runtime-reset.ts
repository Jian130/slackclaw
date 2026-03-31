import type { DeploymentTargetActionResponse } from "@chillclaw/contracts";

import { StateStore, type AppState } from "../services/state-store.js";

export function resetStateAfterRuntimeUninstall(current: AppState): AppState {
  return {
    ...current,
    setupCompletedAt: undefined,
    selectedProfileId: undefined,
    onboarding: undefined,
    channelOnboarding: undefined
  };
}

export function shouldResetStateAfterDeploymentUninstall(result: DeploymentTargetActionResponse): boolean {
  return result.status === "completed" && !result.engineStatus.installed;
}

export async function clearRuntimeUninstallState(store: StateStore): Promise<void> {
  await store.update((current) => resetStateAfterRuntimeUninstall(current));
}
