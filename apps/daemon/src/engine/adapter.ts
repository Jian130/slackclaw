import type {
  EngineCapabilities,
  EngineInstallSpec,
  EngineStatus,
  EngineTaskRequest,
  EngineTaskResult,
  HealthCheckResult,
  InstallResponse,
  RecoveryAction,
  RecoveryRunResponse
} from "@slackclaw/contracts";

export interface EngineAdapter {
  readonly installSpec: EngineInstallSpec;
  readonly capabilities: EngineCapabilities;

  install(autoConfigure: boolean): Promise<InstallResponse>;
  configure(profileId: string): Promise<void>;
  status(): Promise<EngineStatus>;
  healthCheck(selectedProfileId?: string): Promise<HealthCheckResult[]>;
  runTask(request: EngineTaskRequest): Promise<EngineTaskResult>;
  update(): Promise<{ message: string; engineStatus: EngineStatus }>;
  repair(action: RecoveryAction): Promise<RecoveryRunResponse>;
  exportDiagnostics(): Promise<{ filename: string; content: string }>;
}
