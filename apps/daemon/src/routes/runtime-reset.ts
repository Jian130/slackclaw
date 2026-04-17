import { readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type { DeploymentTargetActionResponse } from "@chillclaw/contracts";

import { getDataDir } from "../runtime-paths.js";
import { errorToLogDetails, writeErrorLog } from "../services/logger.js";
import { StateStore, type AppState } from "../services/state-store.js";

interface OpenClawConfigAgentEntry {
  id?: string;
  default?: boolean;
  [key: string]: unknown;
}

interface OpenClawConfigBindingEntry {
  agentId?: string;
  [key: string]: unknown;
}

interface OpenClawConfigForRuntimeReset {
  agents?: {
    list?: OpenClawConfigAgentEntry[];
    [key: string]: unknown;
  };
  bindings?: OpenClawConfigBindingEntry[];
  [key: string]: unknown;
}

function defaultOpenClawConfigPath(): string {
  return resolve(homedir(), ".openclaw", "openclaw.json");
}

function isChillClawManagedMemberAgentId(agentId: string | undefined): boolean {
  return Boolean(agentId?.trim().startsWith("chillclaw-member-"));
}

async function clearManagedAIMemberAgentsFromOpenClawConfig(): Promise<void> {
  const configPath = defaultOpenClawConfigPath();

  let config: OpenClawConfigForRuntimeReset;
  try {
    config = JSON.parse(await readFile(configPath, "utf8")) as OpenClawConfigForRuntimeReset;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return;
    }

    await writeErrorLog("ChillClaw could not read OpenClaw config while clearing managed AI member state.", {
      configPath,
      error: errorToLogDetails(error)
    }, {
      scope: "runtimeReset.clearManagedAIMemberAgentsFromOpenClawConfig"
    });
    return;
  }

  const currentList = Array.isArray(config.agents?.list) ? config.agents.list : undefined;
  const currentBindings = Array.isArray(config.bindings) ? config.bindings : undefined;
  let changed = false;

  if (currentList) {
    const nextList = currentList.filter((entry) => !isChillClawManagedMemberAgentId(entry.id));
    if (nextList.length !== currentList.length) {
      config.agents = {
        ...config.agents,
        list: nextList
      };
      changed = true;
    }
  }

  if (currentBindings) {
    const nextBindings = currentBindings.filter((entry) => !isChillClawManagedMemberAgentId(entry.agentId));
    if (nextBindings.length !== currentBindings.length) {
      if (nextBindings.length > 0) {
        config.bindings = nextBindings;
      } else {
        delete config.bindings;
      }
      changed = true;
    }
  }

  if (!changed) {
    return;
  }

  try {
    await writeFile(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    await writeErrorLog("ChillClaw could not remove managed AI member agents from OpenClaw config.", {
      configPath,
      error: errorToLogDetails(error)
    }, {
      scope: "runtimeReset.clearManagedAIMemberAgentsFromOpenClawConfig"
    });
  }
}

export function resetStateAfterRuntimeUninstall(current: AppState): AppState {
  return {
    ...current,
    setupCompletedAt: undefined,
    selectedProfileId: undefined,
    onboarding: undefined,
    onboardingOperations: undefined,
    onboardingWarmups: undefined,
    channelOnboarding: undefined,
    aiTeam: undefined,
    chat: undefined
  };
}

export function shouldResetStateAfterDeploymentUninstall(result: DeploymentTargetActionResponse): boolean {
  return result.status === "completed" && !result.engineStatus.installed;
}

export async function clearRuntimeUninstallState(store: StateStore): Promise<void> {
  await store.update((current) => resetStateAfterRuntimeUninstall(current));
  await clearManagedAIMemberAgentsFromOpenClawConfig();
  const managedMemberDataDir = resolve(getDataDir(), "ai-members");

  try {
    await rm(managedMemberDataDir, { recursive: true, force: true });
  } catch (error) {
    await writeErrorLog("ChillClaw could not remove managed AI member data after OpenClaw uninstall.", {
      managedMemberDataDir,
      error: errorToLogDetails(error)
    }, {
      scope: "runtimeReset.clearRuntimeUninstallState"
    });
  }
}
