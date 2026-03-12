import type { EngineKind } from "./index.js";

export type EngineCompatibilityCapabilityId =
  | "detect-runtime"
  | "install-managed-runtime"
  | "update-runtime"
  | "uninstall-runtime"
  | "fetch-deployment-targets"
  | "add-model"
  | "modify-model"
  | "remove-model"
  | "set-default-model"
  | "set-fallback-model"
  | "add-channel"
  | "modify-channel"
  | "remove-channel"
  | "restart-gateway"
  | "verify-gateway-health"
  | "run-task-through-default-model";

export type EngineCompatibilityRuntimeMode = "system" | "managed";
export type EngineCompatibilityCheckStatus = "passed" | "failed" | "not-supported" | "skipped";

export interface EngineCompatibilityCapabilityDefinition {
  id: EngineCompatibilityCapabilityId;
  label: string;
  description: string;
}

export interface EngineCompatibilityManifest {
  engine: EngineKind;
  supportedCapabilityIds: EngineCompatibilityCapabilityId[];
}

export interface EngineCompatibilityCheckResult {
  capabilityId: EngineCompatibilityCapabilityId;
  runtimeMode: EngineCompatibilityRuntimeMode;
  status: EngineCompatibilityCheckStatus;
  summary: string;
  engineVersion?: string;
  command?: string;
  affectedAreas: string[];
  likelyFilePaths: string[];
  logPath?: string;
}

export interface EngineCompatibilityRuntimeReport {
  runtimeMode: EngineCompatibilityRuntimeMode;
  detectedVersion?: string;
  checks: EngineCompatibilityCheckResult[];
}

export interface EngineCompatibilityReport {
  engine: EngineKind;
  generatedAt: string;
  candidateVersion?: string;
  staticChecks: {
    build: EngineCompatibilityCheckStatus;
    test: EngineCompatibilityCheckStatus;
  };
  runtimes: EngineCompatibilityRuntimeReport[];
}

export const engineCompatibilityCapabilities: EngineCompatibilityCapabilityDefinition[] = [
  {
    id: "detect-runtime",
    label: "Detect runtime",
    description: "Verify SlackClaw can identify an installed engine runtime and read its version."
  },
  {
    id: "install-managed-runtime",
    label: "Install managed runtime",
    description: "Verify SlackClaw can provision a self-contained managed runtime."
  },
  {
    id: "update-runtime",
    label: "Update runtime",
    description: "Verify SlackClaw can inspect or preview runtime updates."
  },
  {
    id: "uninstall-runtime",
    label: "Uninstall runtime",
    description: "Verify SlackClaw can remove a managed runtime or report system uninstall limits."
  },
  {
    id: "fetch-deployment-targets",
    label: "Fetch deployment targets",
    description: "Verify SlackClaw can resolve deployment target status for the engine."
  },
  {
    id: "add-model",
    label: "Add model",
    description: "Verify SlackClaw can create a saved model entry for the engine."
  },
  {
    id: "modify-model",
    label: "Modify model",
    description: "Verify SlackClaw can update an existing saved model entry."
  },
  {
    id: "remove-model",
    label: "Remove model",
    description: "Verify SlackClaw can delete a saved model entry."
  },
  {
    id: "set-default-model",
    label: "Set default model",
    description: "Verify SlackClaw can switch the active default model entry."
  },
  {
    id: "set-fallback-model",
    label: "Set fallback model",
    description: "Verify SlackClaw can update the active fallback model chain."
  },
  {
    id: "add-channel",
    label: "Add channel",
    description: "Verify SlackClaw can add a channel account."
  },
  {
    id: "modify-channel",
    label: "Modify channel",
    description: "Verify SlackClaw can modify an existing channel account."
  },
  {
    id: "remove-channel",
    label: "Remove channel",
    description: "Verify SlackClaw can remove a channel account."
  },
  {
    id: "restart-gateway",
    label: "Restart gateway",
    description: "Verify SlackClaw can restart the engine gateway."
  },
  {
    id: "verify-gateway-health",
    label: "Verify gateway health",
    description: "Verify SlackClaw can confirm the gateway is reachable and healthy enough for work."
  },
  {
    id: "run-task-through-default-model",
    label: "Run task through default model",
    description: "Verify SlackClaw tasks run through the selected default model entry."
  }
];

export const engineCompatibilityManifests: Record<EngineKind, EngineCompatibilityManifest> = {
  openclaw: {
    engine: "openclaw",
    supportedCapabilityIds: engineCompatibilityCapabilities.map((capability) => capability.id)
  },
  zeroclaw: {
    engine: "zeroclaw",
    supportedCapabilityIds: []
  },
  ironclaw: {
    engine: "ironclaw",
    supportedCapabilityIds: []
  }
};
