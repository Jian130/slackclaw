import type {
  DeploymentTargetActionResponse,
  DeploymentTargetsResponse,
  EngineActionResponse,
  EngineStatus,
  InstallResponse,
  RecoveryAction,
  RecoveryRunResponse
} from "@chillclaw/contracts";

import type { InstanceManager } from "./adapter.js";

type InstanceAccess = {
  install: (autoConfigure: boolean, options?: { forceLocal?: boolean }) => Promise<InstallResponse>;
  uninstall: () => Promise<EngineActionResponse>;
  status: () => Promise<EngineStatus>;
  getDeploymentTargets: () => Promise<DeploymentTargetsResponse>;
  installDeploymentTarget: (targetId: "standard" | "managed-local") => Promise<DeploymentTargetActionResponse>;
  uninstallDeploymentTarget: (targetId: "standard" | "managed-local") => Promise<DeploymentTargetActionResponse>;
  updateDeploymentTarget: (targetId: "standard" | "managed-local") => Promise<DeploymentTargetActionResponse>;
  update: () => Promise<{ message: string; engineStatus: EngineStatus }>;
  repair: (action: RecoveryAction) => Promise<RecoveryRunResponse>;
  exportDiagnostics: () => Promise<{ filename: string; content: string }>;
};

export class OpenClawInstanceManager implements InstanceManager {
  constructor(private readonly access: InstanceAccess) {}

  install(autoConfigure: boolean, options?: { forceLocal?: boolean }) {
    return this.access.install(autoConfigure, options);
  }

  uninstall() {
    return this.access.uninstall();
  }

  status() {
    return this.access.status();
  }

  getDeploymentTargets() {
    return this.access.getDeploymentTargets();
  }

  installDeploymentTarget(targetId: "standard" | "managed-local") {
    return this.access.installDeploymentTarget(targetId);
  }

  uninstallDeploymentTarget(targetId: "standard" | "managed-local") {
    return this.access.uninstallDeploymentTarget(targetId);
  }

  updateDeploymentTarget(targetId: "standard" | "managed-local") {
    return this.access.updateDeploymentTarget(targetId);
  }

  update() {
    return this.access.update();
  }

  repair(action: RecoveryAction) {
    return this.access.repair(action);
  }

  exportDiagnostics() {
    return this.access.exportDiagnostics();
  }
}
